# Imagem base do Python
FROM python:3.11-slim

# Diretório de trabalho no container
WORKDIR /app

# Copiar arquivo de dependências
COPY requirements.txt requirements.txt

# Instalar dependências
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o restante do código
COPY . .

# Expor a porta do Flask
EXPOSE 5000

# Comando padrão para rodar o app
CMD ["python", "app.py"]