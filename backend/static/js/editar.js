// ====================
// Helpers HTTP
// ====================
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function setPreview(url) {
  const preview = document.getElementById('preview-imagem-principal');
  if (!preview) return;
  if (url) {
    preview.src = url;
    preview.style.display = 'block';
  } else {
    preview.src = '';
    preview.style.display = 'none';
  }
}

// ====================
// Toast simples
// ====================
function showToast(message, type = 'info', timeout = 3000) {
  const holderId = 'toast-holder-edit';
  let holder = document.getElementById(holderId);
  if (!holder) {
    holder = document.createElement('div');
    holder.id = holderId;
    holder.style.position = 'fixed';
    holder.style.left = '50%';
    holder.style.top = '1rem';
    holder.style.transform = 'translateX(-50%)';
    holder.style.zIndex = '9999';
    holder.style.display = 'flex';
    holder.style.flexDirection = 'column';
    holder.style.gap = '0.5rem';
    document.body.appendChild(holder);
  }
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.padding = '0.6rem 0.9rem';
  toast.style.borderRadius = '0.6rem';
  toast.style.background = type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : '#0f62fe';
  toast.style.color = '#fff';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  toast.style.fontWeight = '500';
  holder.appendChild(toast);
  setTimeout(() => { toast.remove(); }, timeout);
}

// ====================
// Cloudinary Upload (unsigned)
// ====================
async function cloudinaryUpload(file) {
  const cloudName = document.body?.dataset?.cloudinaryCloudName || '';
  const uploadPreset = document.body?.dataset?.cloudinaryUploadPreset || '';
  if (!cloudName || !uploadPreset) {
    throw new Error('Configuração Cloudinary ausente');
  }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', uploadPreset);
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
  const res = await fetch(url, { method: 'POST', body: fd });
  const j = await res.json();
  if (!res.ok) {
    const msg = j?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { secure_url: j.secure_url, public_id: j.public_id };
}

// ====================
// Carregar e salvar maquete
// ====================
async function loadMaquete(mid) {
  try {
    const m = await fetchJSON(`/api/maquetes/${mid}`);
    const form = document.getElementById('edit-form');
    if (!form) return;
    const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val ?? ''; };
    set('nome', m.nome);
    set('escala', m.escala);
    set('peso', m.peso);
    set('proprietario', m.proprietario);
    set('projeto', m.projeto);
    set('imagem_principal_url', m.imagem_principal_url);
    set('imagem_principal_public_id', m.imagem_principal_public_id);
    set('cidade', m.cidade);
    set('estado', m.estado);
    set('ano', m.ano);
    set('mes', m.mes);
    set('largura_cm', m.largura_cm);
    set('altura_cm', m.altura_cm);
    set('comprimento_cm', m.comprimento_cm);
    set('info', m.info);
    setPreview(m.imagem_principal_url);
  } catch (err) {
    showToast('Erro ao carregar maquete: ' + err.message, 'error');
  }
}

async function saveMaquete(mid) {
  const form = document.getElementById('edit-form');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  // Garantir compatibilidade: info nunca nulo e sanitização da URL
  data.info = (data.info ?? '').trim();
  if (typeof data.imagem_principal_url === 'string') {
    data.imagem_principal_url = data.imagem_principal_url.replace(/`/g, '').trim();
  }
  try {
    await fetchJSON(`/api/maquetes/${mid}`, { method: 'PUT', body: JSON.stringify(data) });
    showToast('Alterações salvas.', 'success');
    setTimeout(() => { window.location.href = '/admin'; }, 600);
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
}

// ====================
// Imagem principal (upload)
// ====================
function initMainImageUpload(mid) {
  const btn = document.getElementById('btn-upload-principal');
  const inputFile = document.getElementById('file-imagem-principal');
  const urlInput = document.getElementById('input-imagem-principal');
  const publicIdInput = document.getElementById('input-public-id-principal');

  btn?.addEventListener('click', () => inputFile?.click());

  inputFile?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      showToast('Enviando imagem principal...', 'info', 1500);
      const up = await cloudinaryUpload(file);
      urlInput && (urlInput.value = up.secure_url || '');
      publicIdInput && (publicIdInput.value = up.public_id || '');
      setPreview(up.secure_url);
      showToast('Imagem principal atualizada!', 'success');
    } catch (err) {
      showToast('Falha no upload: ' + err.message, 'error');
    } finally {
      inputFile.value = '';
    }
  });

  urlInput?.addEventListener('input', (e) => setPreview(e.target.value));
}

// ====================
// Imagens secundárias (listar/adicionar/excluir)
// ====================
async function loadSecondaryImages(mid) {
  try {
    const arr = await fetchJSON(`/api/maquetes/${mid}/images`);
    const holder = document.getElementById('galeria-secundarias');
    if (!holder) return;
    holder.innerHTML = (arr || []).map(img => {
      const displayUrl = img.url || (document.body?.dataset?.cloudinaryCloudName ? `https://res.cloudinary.com/${document.body.dataset.cloudinaryCloudName}/image/upload/${img.public_id}` : '');
      return `
        <div class="card-secundaria">
          <img src="${displayUrl}" alt="Imagem secundária">
          <div class="row">
            <span style="font-size:0.85rem; color:#666;">#${img.id}</span>
            <button type="button" class="btn danger" data-del="${img.id}">Excluir</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast('Erro ao carregar imagens secundárias: ' + err.message, 'error');
  }
}

function initSecondaryImages(mid) {
  const btnAdd = document.getElementById('btn-add-secundaria');
  const fileInput = document.getElementById('file-secundarias');
  const holder = document.getElementById('galeria-secundarias');

  btnAdd?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    try {
      for (const f of files) {
        const up = await cloudinaryUpload(f);
        await fetchJSON(`/api/maquetes/${mid}/images`, {
          method: 'POST',
          body: JSON.stringify({ url: up.secure_url, public_id: up.public_id })
        });
      }
      showToast('Imagens adicionadas!', 'success');
      await loadSecondaryImages(mid);
    } catch (err) {
      showToast('Falha ao adicionar: ' + err.message, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  holder?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-del]');
    if (!btn) return;
    const id = btn.getAttribute('data-del');
    if (!id) return;
    if (!confirm('Excluir esta imagem?')) return;
    try {
      await fetchJSON(`/api/maquetes/${mid}/images/${id}`, { method: 'DELETE' });
      showToast('Imagem excluída.', 'success');
      await loadSecondaryImages(mid);
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'error');
    }
  });
}

// ====================
// Bootstrap
// ====================
window.addEventListener('DOMContentLoaded', () => {
  const mid = document.body?.dataset?.mid;
  if (!mid) return;
  loadMaquete(mid);
  loadSecondaryImages(mid);
  initMainImageUpload(mid);
  initSecondaryImages(mid);

  const form = document.getElementById('edit-form');
  form?.addEventListener('submit', (ev) => { ev.preventDefault(); saveMaquete(mid); });
});