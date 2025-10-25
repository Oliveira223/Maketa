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
#DATABASE_URL = os.getenv("DATABASE_URL_LOCAL") or os.getenv("DATABASE_URL")

# Para github
DATABASE_URL = os.getenv("DATABASE_URL")


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
    return render_template('index.html')

# renderizar painel admin protegido
@app.route('/admin')
@requires_auth
def admin():
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    upload_preset = os.getenv('CLOUDINARY_UPLOAD_PRESET')
    return render_template('dashboard.html', cloudinary_cloud_name=cloud_name, cloudinary_upload_preset=upload_preset)

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
                "SELECT id, nome, escala, proprietario, imagem_principal_url FROM maquetes ORDER BY id DESC"
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
        escala = (data.get("escala") or "").strip() or None
        peso_str = (data.get("peso") or "").strip()
        proprietario = (data.get("proprietario") or "").strip() or None
        projeto = (data.get("projeto") or "").strip() or None
        imagem_principal_url = (data.get("imagem_principal_url") or "").strip().strip('`') or None

        if not nome:
            return jsonify({"error": "invalid_input", "detail": "nome is required"}), 400

        # Convert peso to numeric or None
        peso_val = None
        if peso_str:
            try:
                peso_val = float(peso_str)
            except ValueError:
                return jsonify({"error": "invalid_input", "detail": "peso must be numeric"}), 400

        with engine.begin() as conn:
            new_id = conn.execute(text(
                """
                INSERT INTO maquetes (nome, escala, peso, proprietario, projeto, imagem_principal_url)
                VALUES (:nome, :escala, :peso, :proprietario, :projeto, :imagem_principal_url)
                RETURNING id
                """
            ), {
                "nome": nome,
                "escala": escala,
                "peso": peso_val,
                "proprietario": proprietario,
                "projeto": projeto,
                "imagem_principal_url": imagem_principal_url
            }).scalar()
        return jsonify({"id": int(new_id)}), 201
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
                "SELECT id, nome, escala, peso, proprietario, projeto, imagem_principal_url FROM maquetes WHERE id=:id"
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
    allowed = ['nome', 'escala', 'peso', 'proprietario', 'projeto', 'imagem_principal_url']
    fields = {k: data[k] for k in data.keys() if k in allowed}
    if not fields:
        return jsonify({"error": "no_fields"}), 400
    try:
        # Sanitize values: trim strings; empty -> None; convert peso to numeric
        if 'imagem_principal_url' in fields:
            v = fields['imagem_principal_url']
            s = (str(v) if v is not None else '').strip().strip('`')
            fields['imagem_principal_url'] = s or None
        for k in ['nome', 'escala', 'proprietario', 'projeto']:
            if k in fields:
                v = fields[k]
                s = (str(v) if v is not None else '').strip()
                fields[k] = s or None
        if 'peso' in fields:
            v = fields['peso']
            s = (str(v) if v is not None else '').strip()
            if s == '':
                fields['peso'] = None
            else:
                try:
                    fields['peso'] = float(s)
                except ValueError:
                    return jsonify({"error": "invalid_input", "detail": "peso must be numeric"}), 400

        # Build dynamic SET clause
        set_clauses = [f"{k} = :{k}" for k in fields.keys()]
        with engine.begin() as conn:
            result = conn.execute(text(
                f"UPDATE maquetes SET {', '.join(set_clauses)} WHERE id = :id"
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
# Inicialização do Servidor
# ===============================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[INFO] Servidor iniciado em http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)