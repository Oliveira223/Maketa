import os
from functools import wraps
from flask import Flask, render_template, jsonify, request, Response
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv

# ===============================
# Configuração e Setup
# ===============================

# carregar variáveis de ambiente, configurar DB e Flask
load_dotenv()
# Para pc (não esquecer de abrir ssh)
DATABASE_URL = os.getenv("DATABASE_URL_LOCAL") or os.getenv("DATABASE_URL")

# Para github
#DATABASE_URL = os.getenv("DATABASE_URL")


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Cria engine de conexão (se houver DATABASE_URL)
engine = create_engine(
    DATABASE_URL,
    connect_args={"connect_timeout": 3},
    pool_pre_ping=True
) if DATABASE_URL else None

# Inicialização do aplicativo Flask com caminhos explícitos
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'static'),
    template_folder=os.path.join(BASE_DIR, 'templates')
)

print("[INFO] DATABASE_URL:", DATABASE_URL)

# ===============================
# SEGURANÇA - Autenticação básica para rotas admin
# ===============================

# valida credenciais admin usando variáveis de ambiente
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', os.getenv('ADMIN_USER', 'admin'))
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', os.getenv('ADMIN_PASS', 'change_this_password'))

def check_auth(username, password):
    return username == ADMIN_USERNAME and password == ADMIN_PASSWORD

# responde 401 com cabeçalho WWW-Authenticate
def authenticate():
    return Response(
        'Acesso restrito.\n', 401,
        {'WWW-Authenticate': 'Basic realm="Painel Admin"'}
    )

# decorator para proteger rotas administrativas
def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated

# ===============================
# Rotas de páginas
# ===============================

# renderizar página inicial
@app.route('/')
def index():
    return render_template('pages/index.html')

# renderizar painel admin protegido
@app.route('/admin')
@requires_auth
def admin():
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    upload_preset = os.getenv('CLOUDINARY_UPLOAD_PRESET')
    return render_template('pages/dashboard.html', cloudinary_cloud_name=cloud_name, cloudinary_upload_preset=upload_preset)

# Página de edição
@app.route('/admin/maquetes/<int:mid>/editar')
@requires_auth
def editar_maquete(mid: int):
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    upload_preset = os.getenv('CLOUDINARY_UPLOAD_PRESET')
    return render_template('pages/editar_maquete.html', maquete_id=mid, cloudinary_cloud_name=cloud_name, cloudinary_upload_preset=upload_preset)

# ===============================
# Healthcheck
# ===============================

def ensure_db():
    if not engine:
        return False, "missing_config"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as e:
        print("[ERROR] DB connection:", e)
        return False, str(e)

# verificar status da app e conexão com o banco 
@app.route('/health')
def health():
    status = {"app": "ok"}
    ok, err = ensure_db()
    if ok:
        status["db"] = "ok"
    else:
        status["db"] = "error" if engine else "missing_config"
        if err:
            status["error"] = err
    return jsonify(status)

# ===============================
# Migração leve: coluna 'info' em 'maquetes'
# ===============================

def ensure_schema_info():
    ok, err = ensure_db()
    if not ok:
        print("[WARN] DB indisponível; migração 'info' não executada:", err)
        return
    try:
        with engine.begin() as conn:
            # Garante existência da coluna
            conn.execute(text("ALTER TABLE maquetes ADD COLUMN IF NOT EXISTS info TEXT"))
            # Verifica tipo atual da coluna
            col = conn.execute(text(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_name = 'maquetes' AND column_name = 'info'
                """
            )).mappings().first()
            if col:
                dt = (col.get('data_type') or '').lower()
                udt = (col.get('udt_name') or '').lower()
                # Se for ARRAY (ex.: _text), converte para TEXT preservando conteúdo
                if dt == 'array' or udt == '_text':
                    conn.execute(text(
                        """
                        ALTER TABLE maquetes
                        ALTER COLUMN info TYPE TEXT
                        USING COALESCE(array_to_string(info, ' '), '')
                        """
                    ))
                    print("[INFO] Coluna 'info' convertida de TEXT[] para TEXT")
                elif dt != 'text':
                    # Qualquer outro tipo inesperado: força conversão para TEXT
                    conn.execute(text(
                        """
                        ALTER TABLE maquetes
                        ALTER COLUMN info TYPE TEXT
                        USING COALESCE(info::text, '')
                        """
                    ))
                    print("[INFO] Coluna 'info' ajustada para TEXT")
        print("[INFO] Migração leve: coluna 'info' ok")
    except Exception as e:
        print("[ERROR] Migração leve 'info':", e)

# Permitir nomes repetidos: remove UNIQUE em maquetes.nome
def ensure_nome_allows_duplicates():
    ok, err = ensure_db()
    if not ok:
        print("[WARN] DB indisponível; ajuste UNIQUE 'nome' não executado:", err)
        return
    try:
        with engine.begin() as conn:
            # Localiza quaisquer UNIQUE constraints sobre a coluna 'nome'
            cons = conn.execute(text(
                """
                SELECT tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_name = 'maquetes'
                  AND tc.constraint_type = 'UNIQUE'
                  AND kcu.column_name = 'nome'
                """
            )).fetchall()
            for row in cons:
                name = row[0]
                conn.execute(text(f'ALTER TABLE maquetes DROP CONSTRAINT "{name}"'))
                print(f"[INFO] Removido UNIQUE constraint {name} de 'maquetes.nome'")
            # Também remove índice único se existir com nome padrão
            conn.execute(text('DROP INDEX IF EXISTS maquetes_nome_key'))
        print("[INFO] 'maquetes.nome' agora permite duplicados")
    except Exception as e:
        print("[WARN] Falha ao ajustar UNIQUE de 'nome':", e)

# Executar migrações leves ao iniciar
ensure_schema_info()
ensure_nome_allows_duplicates()

# ===============================
# API Maquetes
# ===============================

# listar maquetes com campos básicos
@app.route('/api/maquetes', methods=['GET'])
@requires_auth
def list_maquetes():
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    try:
        with engine.begin() as conn:
            rows = conn.execute(text(
                "SELECT id, nome, escala, proprietario, imagem_principal_url, imagem_principal_public_id FROM maquetes ORDER BY id DESC"
            )).mappings().all()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        print("[ERROR] list_maquetes:", e)
        return jsonify({"error": "query_error", "detail": str(e)}), 500

# criar uma nova maquete    
@app.route('/api/maquetes', methods=['POST'])
@requires_auth
def create_maquete():
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    data = request.get_json(force=True) or {}
    try:
        # Sanitize inputs: trim strings and convert empty strings to None
        nome = (data.get("nome") or "").strip()
        escala = (data.get("escala") or "").strip()
        peso_str = (str(data.get("peso")) if data.get("peso") is not None else '').strip()
        proprietario = (data.get("proprietario") or "").strip()
        projeto = (data.get("projeto") or "").strip()
        imagem_principal_url = (data.get("imagem_principal_url") or "").strip()
        # remover crases/backticks eventualmente colados
        imagem_principal_url = imagem_principal_url.strip('`').replace('`', '')
        imagem_principal_public_id = (data.get("imagem_principal_public_id") or "").strip()
        # Novos campos
        cidade = (data.get("cidade") or "").strip()
        estado = (data.get("estado") or "").strip().upper()
        ano_str = (str(data.get("ano")) if data.get("ano") is not None else '').strip()
        mes_str = (str(data.get("mes")) if data.get("mes") is not None else '').strip()
        largura_str = (str(data.get("largura_cm")) if data.get("largura_cm") is not None else '').strip()
        altura_str = (str(data.get("altura_cm")) if data.get("altura_cm") is not None else '').strip()
        comprimento_str = (str(data.get("comprimento_cm")) if data.get("comprimento_cm") is not None else '').strip()
        
        if not nome:
            return jsonify({"error": "invalid_input", "detail": "nome is required"}), 400

        # Convert strings to numeric types where applicable
        peso = float(peso_str) if peso_str else None
        ano = int(ano_str) if ano_str else None
        mes = int(mes_str) if mes_str else None
        largura_cm = int(largura_str) if largura_str else None
        altura_cm = int(altura_str) if altura_str else None
        comprimento_cm = int(comprimento_str) if comprimento_str else None

        # Validações simples
        if mes is not None and (mes < 1 or mes > 12):
            return jsonify({"error": "invalid_input", "detail": "mes must be between 1 and 12"}), 400
        if ano is not None and (ano < 1900 or ano > 2100):
            return jsonify({"error": "invalid_input", "detail": "ano out of range"}), 400
        for val, name in [(largura_cm, 'largura_cm'), (altura_cm, 'altura_cm'), (comprimento_cm, 'comprimento_cm')]:
            if isinstance(val, str):
                return jsonify({"error": "invalid_input", "detail": f"{name} must be integer"}), 400
        if estado:
            if len(estado) != 2 or not estado.isalpha():
                return jsonify({"error": "invalid_input", "detail": "estado must be two letters (UF)"}), 400

        with engine.begin() as conn:
            row = conn.execute(text(
                """
                INSERT INTO maquetes (nome, escala, peso, proprietario, projeto, info, imagem_principal_url, imagem_principal_public_id, cidade, estado, ano, mes, largura_cm, altura_cm, comprimento_cm)
                VALUES (:nome, :escala, :peso, :proprietario, :projeto, COALESCE(:info, ''), :imagem_principal_url, :imagem_principal_public_id, :cidade, :estado, :ano, :mes, :largura_cm, :altura_cm, :comprimento_cm)
                RETURNING id
            """), {
                "nome": nome,
                "escala": escala or None,
                "peso": peso,
                "proprietario": proprietario or None,
                "projeto": projeto or None,
                "info": (data.get("info") or "").strip(),
                "imagem_principal_url": imagem_principal_url or None,
                "imagem_principal_public_id": imagem_principal_public_id or None,
                "cidade": cidade or None,
                "estado": estado or None,
                "ano": ano,
                "mes": mes,
                "largura_cm": largura_cm,
                "altura_cm": altura_cm,
                "comprimento_cm": comprimento_cm,
            }).first()
            new_id = row.id
        return jsonify({"ok": True, "id": new_id}), 201
    except IntegrityError as e:
        print("[ERROR] create_maquete IntegrityError:", e)
        detail = "Uma maquete com este nome já existe"
        try:
            orig = getattr(e, 'orig', None)
            diag = getattr(orig, 'diag', None)
            constraint = getattr(diag, 'constraint_name', None)
            if constraint and constraint != 'maquetes_nome_key':
                detail = f"Violação de integridade: {constraint}"
        except Exception:
            pass
        return jsonify({"error": "duplicate_nome", "detail": detail}), 409
    except Exception as e:
        print("[ERROR] create_maquete:", e)
        return jsonify({"error": "insert_error", "detail": str(e)}), 500

# excluir maquete pelo id   
@app.route('/api/maquetes/<int:mid>', methods=['DELETE'])
@requires_auth
def delete_maquete(mid: int):
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM maquetes WHERE id=:id"), {"id": mid})
        return '', 204
    except Exception as e:
        print("[ERROR] delete_maquete:", e)
        return jsonify({"error": "delete_error", "detail": str(e)}), 500

# obter maquete por id
@app.route('/api/maquetes/<int:mid>', methods=['GET'])
@requires_auth
def get_maquete(mid: int):
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    try:
        with engine.begin() as conn:
            row = conn.execute(text(
            """
            SELECT id, nome, escala, peso, proprietario, projeto, info, imagem_principal_url, imagem_principal_public_id, largura_cm, altura_cm, comprimento_cm, cidade, estado, ano, mes FROM maquetes WHERE id=:id
            """
        ), {"id": mid}).mappings().first()
        if not row:
            return jsonify({"error": "not_found"}), 404
        return jsonify(dict(row)), 200
    except Exception as e:
        print("[ERROR] get_maquete:", e)
        return jsonify({"error": "query_error", "detail": str(e)}), 500

# atualizar maquete por id
@app.route('/api/maquetes/<int:mid>', methods=['PUT'])
@requires_auth
def update_maquete(mid: int):
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    data = request.get_json(force=True) or {}
    allowed = ['nome', 'escala', 'peso', 'proprietario', 'projeto', 'info', 'imagem_principal_url', 'imagem_principal_public_id', 'cidade', 'estado', 'ano', 'mes', 'largura_cm', 'altura_cm', 'comprimento_cm']
    fields = {k: data[k] for k in data.keys() if k in allowed}
    if not fields:
        return jsonify({"error": "no_fields"}), 400
    try:
        # Sanitize values: trim strings; empty -> None; convert numeric fields
        if 'imagem_principal_url' in fields:
            v = fields['imagem_principal_url']
            s = (str(v) if v is not None else '').strip().strip('`').replace('`','')
            fields['imagem_principal_url'] = s or None
        if 'imagem_principal_public_id' in fields:
            v = fields['imagem_principal_public_id']
            s = (str(v) if v is not None else '').strip()
            fields['imagem_principal_public_id'] = s or None
        for k in ['nome', 'escala', 'proprietario', 'projeto', 'cidade']:
            if k in fields:
                v = fields[k]
                s = (str(v) if v is not None else '').strip()
                fields[k] = s or None
        # info: nunca NULL; sempre string (pode ser vazia)
        if 'info' in fields:
            v = fields['info']
            s = (str(v) if v is not None else '').strip()
            fields['info'] = s
        # numeric: peso (float), ano/mes/largura/altura/comprimento (int)
        if 'peso' in fields:
            v = fields['peso']
            s = (str(v) if v is not None else '').strip()
            fields['peso'] = float(s) if s else None
        for k in ['ano','mes','largura_cm','altura_cm','comprimento_cm']:
            if k in fields:
                v = fields[k]
                s = (str(v) if v is not None else '').strip()
                fields[k] = int(s) if s else None
        with engine.begin() as conn:
            result = conn.execute(text(
                """
                UPDATE maquetes
                SET nome = COALESCE(:nome, nome),
                    escala = COALESCE(:escala, escala),
                    peso = COALESCE(:peso, peso),
                    proprietario = COALESCE(:proprietario, proprietario),
                    projeto = COALESCE(:projeto, projeto),
                    info = :info,
                    imagem_principal_url = COALESCE(:imagem_principal_url, imagem_principal_url),
                    imagem_principal_public_id = COALESCE(:imagem_principal_public_id, imagem_principal_public_id),
                    cidade = COALESCE(:cidade, cidade),
                    estado = COALESCE(:estado, estado),
                    ano = COALESCE(:ano, ano),
                    mes = COALESCE(:mes, mes),
                    largura_cm = COALESCE(:largura_cm, largura_cm),
                    altura_cm = COALESCE(:altura_cm, altura_cm),
                    comprimento_cm = COALESCE(:comprimento_cm, comprimento_cm)
                WHERE id = :id
                """
            ), {**fields, "id": mid})
            if result.rowcount == 0:
                return jsonify({"error": "not_found"}), 404
        return jsonify({"id": mid}), 200
    except IntegrityError as e:
        print("[ERROR] update_maquete IntegrityError:", e)
        detail = "Uma maquete com este nome já existe"
        try:
            orig = getattr(e, 'orig', None)
            diag = getattr(orig, 'diag', None)
            constraint = getattr(diag, 'constraint_name', None)
            if constraint and constraint != 'maquetes_nome_key':
                detail = f"Violação de integridade: {constraint}"
        except Exception:
            pass
        return jsonify({"error": "duplicate_nome", "detail": detail}), 409
    except Exception as e:
        print("[ERROR] update_maquete:", e)
        return jsonify({"error": "update_error", "detail": str(e)}), 500

# ===============================
# API Imagens Secundárias
# ===============================
@app.route('/api/maquetes/<int:mid>/images', methods=['GET'])
@requires_auth
def list_maquete_images(mid: int):
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    try:
        with engine.begin() as conn:
            rows = conn.execute(text(
                """
                SELECT id, url, public_id, position, created_at
                FROM maquete_images
                WHERE maquete_id = :mid
                ORDER BY COALESCE(position, 999999), id
                """
            ), {"mid": mid}).mappings().all()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        print("[ERROR] list_maquete_images:", e)
        return jsonify({"error": "query_error", "detail": str(e)}), 500

@app.route('/api/maquetes/<int:mid>/images', methods=['POST'])
@requires_auth
def create_maquete_image(mid: int):
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    data = request.get_json(force=True) or {}
    try:
        url = (data.get("url") or "").strip()
        public_id = (data.get("public_id") or "").strip()
        pos = data.get("position")
        if not public_id and not url:
            return jsonify({"error": "invalid_input", "detail": "public_id or url is required"}), 400
        # Descobrir próxima posição se não fornecida
        with engine.begin() as conn:
            if pos is None:
                next_pos = conn.execute(text(
                    "SELECT COALESCE(MAX(position), 0) + 1 FROM maquete_images WHERE maquete_id = :mid"
                ), {"mid": mid}).scalar() or 1
            else:
                next_pos = int(pos)
            new_id = conn.execute(text(
                """
                INSERT INTO maquete_images (maquete_id, url, public_id, position)
                VALUES (:mid, :url, :public_id, :position)
                RETURNING id
                """
            ), {"mid": mid, "url": url or None, "public_id": public_id or None, "position": next_pos}).scalar()
        return jsonify({"id": int(new_id), "position": next_pos}), 201
    except IntegrityError as e:
        print("[ERROR] create_maquete_image IntegrityError:", e)
        return jsonify({"error": "duplicate_image", "detail": "Imagem já cadastrada para esta maquete"}), 409
    except Exception as e:
        print("[ERROR] create_maquete_image:", e)
        return jsonify({"error": "insert_error", "detail": str(e)}), 500

@app.route('/api/maquetes/<int:mid>/images/<int:image_id>', methods=['DELETE'])
@requires_auth
def delete_maquete_image(mid: int, image_id: int):
    ok, err = ensure_db()
    if not ok:
        return jsonify({"error": "db_unavailable", "detail": err}), 503
    try:
        with engine.begin() as conn:
            result = conn.execute(text(
                "DELETE FROM maquete_images WHERE id = :iid AND maquete_id = :mid"
            ), {"iid": image_id, "mid": mid})
            if result.rowcount == 0:
                return jsonify({"error": "not_found"}), 404
        return '', 204
    except Exception as e:
        print("[ERROR] delete_maquete_image:", e)
        return jsonify({"error": "delete_error", "detail": str(e)}), 500

# ===============================
# Inicialização do Servidor
# ===============================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_env = os.environ.get('FLASK_DEBUG') or os.environ.get('DEBUG')
    debug_flag = str(debug_env).strip().lower() in ('1', 'true', 'yes', 'on')
    print(f"[INFO] Servidor iniciado em http://localhost:{port}")
    print(f"[INFO] Debug: {'on' if debug_flag else 'off'}")
    if debug_flag:
        # Evitar incompatibilidade do watchdog no Windows/Python 3.13
        app.run(host='0.0.0.0', port=port, debug=True, use_reloader=True, reloader_type='stat')
    else:
        app.run(host='0.0.0.0', port=port, debug=False)