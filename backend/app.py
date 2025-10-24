import os
from flask import Flask, render_template, jsonify
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# DATABASE_URL_LOCAL (para PC com túnel SSH) ou DATABASE_URL (para Docker)
DATABASE_URL = os.getenv("DATABASE_URL_LOCAL") or os.getenv("DATABASE_URL")

# Engine do banco (fallback para iniciar sem DB)
engine = create_engine(DATABASE_URL) if DATABASE_URL else None

# Inicialização do Flask
app = Flask(
    __name__,
    static_folder='static',
    template_folder='templates'
)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health')
def health():
    status = {"app": "ok"}
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            status["db"] = "ok"
        except Exception as e:
            status["db"] = "error"
            status["error"] = str(e)
    else:
        status["db"] = "missing_config"
    return jsonify(status)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)