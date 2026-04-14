
const BancalModal = {
    _createBackdrop() {
        let backdrop = document.getElementById('bancal-modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'bancal-modal-backdrop';
            backdrop.className = 'modal-backdrop';
            backdrop.innerHTML = `
                <div class="modal-container">
                    <div class="modal-title" id="bancal-modal-title"></div>
                    <div class="modal-text" id="bancal-modal-text"></div>
                    <div class="modal-actions" id="bancal-modal-actions"></div>
                </div>
            `;
            document.body.appendChild(backdrop);
        }
        return backdrop;
    },

    alert(message, title = "Bancal") {
        return new Promise((resolve) => {
            const backdrop = this._createBackdrop();
            const titleEl = document.getElementById('bancal-modal-title');
            const textEl = document.getElementById('bancal-modal-text');
            const actionsEl = document.getElementById('bancal-modal-actions');

            titleEl.innerText = title;
            textEl.innerText = message;
            actionsEl.innerHTML = `
                <button class="modal-btn modal-btn-confirm" id="bancal-modal-ok">OK</button>
            `;

            backdrop.classList.add('active');

            document.getElementById('bancal-modal-ok').onclick = () => {
                backdrop.classList.remove('active');
                resolve();
            };
        });
    },

    confirm(message, title = "Confirmation") {
        return new Promise((resolve) => {
            const backdrop = this._createBackdrop();
            const titleEl = document.getElementById('bancal-modal-title');
            const textEl = document.getElementById('bancal-modal-text');
            const actionsEl = document.getElementById('bancal-modal-actions');

            titleEl.innerText = title;
            textEl.innerText = message;
            actionsEl.innerHTML = `
                <button class="modal-btn modal-btn-cancel" id="bancal-modal-no">Non</button>
                <button class="modal-btn modal-btn-confirm" id="bancal-modal-yes">Oui</button>
            `;

            backdrop.classList.add('active');

            document.getElementById('bancal-modal-no').onclick = () => {
                backdrop.classList.remove('active');
                resolve(false);
            };

            document.getElementById('bancal-modal-yes').onclick = () => {
                backdrop.classList.remove('active');
                resolve(true);
            };
        });
    }
};

window.alert = (msg) => BancalModal.alert(msg);
window.confirm = (msg) => BancalModal.confirm(msg);
