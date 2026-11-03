function openModal(title, bodyHtml, actions) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><div class="modal-header"><div class="modal-title">${escapeHtml(title)}</div><button class="modal-close" id="modal-close-btn">&times;</button></div><div id="modal-body">${bodyHtml}</div>${actions ? `<div class="modal-actions">${actions}</div>` : ''}</div></div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.getElementById('modal-close-btn').addEventListener('click', () => closeModal());
  root.appendChild(overlay);
  return document.getElementById('modal-body');
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function confirmModal(title, message, onConfirm, confirmText) {
  const body = `<p>${escapeHtml(message)}</p>`;
  const actions = `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-danger" id="modal-confirm">${escapeHtml(confirmText || 'Delete')}</button>
  `;
  openModal(title, body, actions);
  document.getElementById('modal-confirm').addEventListener('click', async () => { closeModal(); await onConfirm(); });
  document.getElementById('modal-cancel').addEventListener('click', () => closeModal());
}

async function exportReport(path) {
  try {
    const data = await API.download(path);
    toast('Report exported successfully.');
    return data;
  } catch (e) {
    toast(e.message || 'Export failed.', 'error');
    return null;
  }
}

function exportPdf(path) { return exportReport(`${path}&format=pdf`); }
function exportXls(path) { return exportReport(`${path}&format=xls`); }

// status filter options
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
];
