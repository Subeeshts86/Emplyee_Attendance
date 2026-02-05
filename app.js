// --- Safe Storage Wrapper (Must be first) ---
const safeStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { console.warn('Storage Access Blocked', e); return null; }
    },
    setItem: (key, val) => {
        try { localStorage.setItem(key, val); }
        catch (e) {
            console.error('Storage Write Failed', e);
            if (e.name === 'QuotaExceededError') alert('Storage Full! Data could not be saved.');
        }
    },
    removeItem: (key) => {
        try { localStorage.removeItem(key); } catch (e) { }
    }
};

// --- Store Management ---
const STORE_KEY = 'attendance_app_v2';

const defaultState = {
    settings: {
        retailers: ['Xcite', 'Eureka', 'Best', 'Lulu', 'Jarir'],
        locations: ['Al Rai', 'Avenues', 'Baitak', 'Boulevard', 'Egaila', 'Fadalah', 'Fahaheel', 'Farwaniya', 'Gazzali', 'Hawally', 'Jleeb', 'Jahra', 'Kuwait City', 'Qurain', 'Salmiya', 'Salmiya Souk', 'Yaal Mall'],
        departments: ['Lenovo IT', 'Asus', 'Motorola', 'Razer', 'Steelseries', 'Toshiba', 'Logitech', 'Anker'],
        designations: ['Promoter', 'Supervisor', 'VM']
    },
    currentSheet: {
        empName: '', civilId: '', retailer: '', location: '', department: '', designation: '',
        month: new Date().getMonth(), year: new Date().getFullYear(),
        attendance: {}
    },
    savedSheets: []
};

// --- Language Handling ---
// --- Language Handling (Removed) ---
// Enforce English Only
function validateEnglishInput(e) {
    const input = e.target;
    // Regex: ASCII printable characters (0-127) only
    const englishRegex = /^[\x00-\x7F]*$/;

    if (!englishRegex.test(input.value)) {
        // Remove non-English characters
        input.value = input.value.replace(/[^\x00-\x7F]/g, '');
        showMessage('Input Error', 'Please use English characters only.', 'error');
    }
}

let appState;
let sessionPin = null; // Stores key in memory only



// --- State Management : Load/Save with Encryption ---
function loadState(pin = null) {
    const raw = safeStorage.getItem(STORE_KEY);

    // 1. No Data: Return Defaults
    if (!raw) {
        appState = JSON.parse(JSON.stringify(defaultState));
        return true;
    }

    try {
        // 2. Try Plain Text (Legacy or No PIN)
        appState = JSON.parse(raw);
        return true;
    } catch (e) {
        // JSON parse failed, assume Encrypted
        if (!pin) return false; // Needs PIN to decrypt

        try {
            const bytes = CryptoJS.AES.decrypt(raw, pin);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (!decrypted) return false; // Wrong key

            appState = JSON.parse(decrypted);
            return true;
        } catch (decErr) {
            console.error('Decryption failed:', decErr);
            return false;
        }
    }
}

// FIX: Removed setTimeout to prevent data loss on immediate refresh
function saveState() {
    if (!appState) return;
    try {
        let dataToSave;
        if (isPinEnabled()) {
            if (!sessionPin) {
                console.error("Security Block: Session PIN missing. Save aborted.");
                return;
            }
            // Encrypt
            dataToSave = CryptoJS.AES.encrypt(JSON.stringify(appState), sessionPin).toString();
        } else {
            // Plain Text
            dataToSave = JSON.stringify(appState);
        }
        safeStorage.setItem(STORE_KEY, dataToSave);
        console.log("Data saved successfully at " + new Date().toLocaleTimeString()); // Debug Confirmation
        updateStorageMonitor();
    } catch (e) { console.error("Save Error", e); }
}

// --- Security: Activity Tracking for Auto-Logout ---
let activityTimer;
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

function resetActivityTimer() {
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => {
        autoLogout();
    }, INACTIVITY_TIMEOUT);
}

function autoLogout() {
    // Clear current editing sheet (not saved data)
    if (appState && appState.currentSheet && (appState.currentSheet.empName || appState.currentSheet.civilId)) {
        appState.currentSheet = JSON.parse(JSON.stringify(defaultState.currentSheet));
        saveState();

        // Show notification
        showMessage('Auto Logout', 'Cleared current data due to inactivity (15 min)', 'warning', false);

        // Reload to reset UI
        setTimeout(() => location.reload(), 1500);
    }
}

// Track user activity
if (typeof document !== 'undefined') {
    ['mousedown', 'keypress', 'touchstart', 'scroll'].forEach(event => {
        document.addEventListener(event, resetActivityTimer, { passive: true });
    });
    resetActivityTimer(); // Start timer
}

// --- Security: PIN Lock System & Encryption ---

function hashPin(pin) {
    return CryptoJS.SHA256(pin).toString();
}

function isPinEnabled() {
    return safeStorage.getItem('app_pin_enabled') === 'true';
}

function getStoredPinHash() {
    return safeStorage.getItem('app_pin_hash');
}

function verifyPin(enteredPin) {
    const storedHash = getStoredPinHash();
    const enteredHash = hashPin(enteredPin);
    if (storedHash === enteredHash) {
        if (appState) {
            // If we have state but just verifying PIN to unlock
            sessionPin = enteredPin;
            // No need to reload loadState if we already have it, but consistent to check
            return { success: true };
        } else {
            if (loadState(enteredPin)) {
                sessionPin = enteredPin;
                return { success: true };
            } else {
                return { success: false };
            }
        }
    }
    return { success: false };
}

function setPin(newPin) {
    if (!newPin || newPin.length !== 4) return false;
    const hash = hashPin(newPin);
    safeStorage.setItem('app_pin_hash', hash);
    safeStorage.setItem('app_pin_enabled', 'true');
    sessionPin = newPin;

    // Re-save data encrypted
    saveState();
    return true;
}

function clearPin() {
    safeStorage.removeItem('app_pin_hash');
    safeStorage.setItem('app_pin_enabled', 'false');
    sessionPin = null;
    saveState(); // Save as plain text
}

function isEncrypted(str) {
    return str && typeof str === 'string' && str.startsWith('U2FsdGVkX1'); // "Salted__" in Base64
}

// --- PIN Auth Adapter (Settings) ---
window.requestPinAuth = function (callback, titleStr, subStr) {
    window.pinAuthCallback = callback;
    showPinModal();
};

function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

// --- Theme ---
function initTheme() {
    const saved = localStorage.getItem('theme_preference');
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (system ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme_preference', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (btn) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        btn.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}"></i>`;
        refreshIcons();
    }
}

// --- Modals ---
function showMessage(title, text, type = 'info', allowHtml = false) {
    const modal = document.getElementById('message-modal');
    if (!modal) return;

    document.getElementById('message-title').textContent = title;

    const textEl = document.getElementById('message-text');
    if (allowHtml) textEl.innerHTML = text;
    else textEl.textContent = text;

    const iconMap = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'x-circle' };
    const iconEl = document.getElementById('message-icon');
    iconEl.className = `message-icon ${type}`;
    iconEl.innerHTML = `<i data-lucide="${iconMap[type]}"></i>`;

    const btn = document.getElementById('message-ok-btn');
    if (btn) btn.onclick = closeMessage;

    modal.classList.remove('hidden');
    refreshIcons();
}

window.closeMessage = function () {
    document.getElementById('message-modal').classList.add('hidden');
}

// --- Utility: Confirm Dialog ---
window.showConfirm = function (title, message, onYes, onNo) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const textEl = document.getElementById('confirm-text');
    const yesBtn = document.getElementById('confirm-yes-btn');
    const noBtn = document.getElementById('confirm-no-btn');

    if (!modal || !titleEl || !textEl || !yesBtn || !noBtn) {
        if (confirm(message)) {
            if (onYes) onYes();
        } else {
            if (onNo) onNo();
        }
        return;
    }

    titleEl.textContent = title;
    textEl.textContent = message;

    // Reset Listeners safely
    const newYes = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);

    const newNo = noBtn.cloneNode(true);
    noBtn.parentNode.replaceChild(newNo, noBtn);

    newYes.onclick = () => {
        modal.classList.add('hidden');
        if (onYes) onYes();
    };

    newNo.onclick = () => {
        modal.classList.add('hidden');
        if (onNo) onNo();
    };

    modal.classList.remove('hidden');
};

// --- UI Logic ---
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Ramadan Dates (Approximate)
const RAMADAN_DATES = {
    2025: { start: '02-28', end: '03-30' },
    2026: { start: '02-17', end: '03-19' },
    2027: { start: '02-07', end: '03-08' },
    2028: { start: '01-27', end: '02-25' },
    2029: { start: '01-15', end: '02-13' },
    2030: { start: '01-05', end: '02-03' }
};

function getDaysInMonth(year, month) {
    return new Date(year, parseInt(month) + 1, 0).getDate();
}

function isRamadan(dateObj) {
    const y = dateObj.getFullYear();
    const range = RAMADAN_DATES[y];
    if (!range) return false;
    const start = new Date(`${y}-${range.start}T00:00:00`);
    const end = new Date(`${y}-${range.end}T23:59:59`);
    return dateObj >= start && dateObj <= end;
}

function getDefaultTimes(dateObj) {
    if (isRamadan(dateObj)) {
        return { inHour: '07', inMin: '00', inAmPm: 'PM', outHour: '01', outMin: '00', outAmPm: 'AM' };
    }
    return { inHour: '01', inMin: '00', inAmPm: 'PM', outHour: '10', outMin: '00', outAmPm: 'PM' };
}

function updateAllDropdowns() {
    const s = appState.currentSheet;

    // Safely update elements only if they exist
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText('retailerText', s.retailer || 'Select Retailer');
    setText('locationText', s.location || 'Select Location');
    setText('deptText', s.department || 'Select Department');
    setText('desigText', s.designation || 'Select Designation');
    setText('monthText', MONTH_NAMES[parseInt(s.month)] || 'Select Month');
    setText('yearText', s.year || 'Select Year');

    renderSettingsList('retailerList', appState.settings.retailers, 'retailers');
    renderSettingsList('locationList', appState.settings.locations, 'locations');
    renderSettingsList('deptList', appState.settings.departments, 'departments');
    renderSettingsList('desigList', appState.settings.designations, 'designations');
}

// --- Audio ---
let audioCtx = null;
function playTick() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);

        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.03);
    } catch (e) { /* ignore audio errors */ }
}

// --- Picker ---
function openPicker(type, currentVal, callback) {
    if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    const modal = document.getElementById('picker-modal');
    const body = document.getElementById('picker-body');
    const title = document.getElementById('picker-title');
    const confirmBtn = document.getElementById('pickerConfirmBtn');

    if (!modal || !body || !confirmBtn) return;

    body.innerHTML = '';
    modal.classList.remove('hidden');
    document.body.classList.add('no-scroll');

    let options = [];
    if (type === 'retailer') options = appState.settings.retailers.map(x => ({ label: x, value: x }));
    else if (type === 'location') options = appState.settings.locations.map(x => ({ label: x, value: x }));
    else if (type === 'department') options = appState.settings.departments.map(x => ({ label: x, value: x }));
    else if (type === 'designation') options = appState.settings.designations.map(x => ({ label: x, value: x }));
    else if (type === 'month') options = MONTH_NAMES.map((m, i) => ({ label: m, value: i.toString() }));
    else if (type === 'year') { for (let i = 2025; i <= 2036; i++) options.push({ label: i.toString(), value: i.toString() }); }
    else if (type === 'ampm') options = [{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }];
    else if (type === 'remarks') options = ['', 'Weekly Off', 'Comp Off', 'Vacation', 'Emergency Leave', 'Sick Leave', 'Umrah Leave', 'Unpaid Leave', 'Not Joined'].map(x => ({ label: x || 'None', value: x }));
    else if (type === 'time') {
        const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        for (let h of hours) {
            for (let m = 0; m < 60; m += 15) {
                let t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                options.push({ label: t, value: t });
            }
        }
    }

    if (title) title.textContent = 'Select ' + type;

    let selectedValue = currentVal || (options[0] ? options[0].value : '');

    options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'picker-option';
        div.textContent = opt.label;
        div.dataset.value = opt.value;
        div.onclick = () => {
            const index = Array.from(body.children).indexOf(div);
            body.scrollTop = index * 50;
        };
        body.appendChild(div);
    });

    // Scroll Logic
    let lastIndex = -1;
    const updateActive = () => {
        const center = body.scrollTop + 130;
        const index = Math.floor(center / 50) - 2;

        if (index !== lastIndex) {
            if (lastIndex !== -1) playTick();
            lastIndex = index;
        }

        Array.from(body.children).forEach((child, i) => {
            if (i === index) {
                child.classList.add('picker-option-active');
                selectedValue = child.dataset.value;
            } else {
                child.classList.remove('picker-option-active');
            }
        });
    };

    body.onscroll = updateActive;

    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.onclick = () => {
        try {
            callback(selectedValue);
        } catch (e) {
            console.error("Picker Callback Error:", e);
            showMessage('Error', 'Failed to update selection.', 'error');
        } finally {
            modal.classList.add('hidden');
            document.body.classList.remove('no-scroll');
        }
    };

    refreshIcons();

    if (currentVal) {
        setTimeout(() => {
            const found = Array.from(body.children).find(el => {
                const opt = options.find(o => o.value === currentVal);
                return el.textContent === (opt ? opt.label : currentVal);
            });
            if (found) {
                found.scrollIntoView({ block: 'center' });
                setTimeout(updateActive, 50);
            } else {
                updateActive();
            }
        }, 50);
    } else {
        setTimeout(updateActive, 50);
    }
}

window.openHeaderPicker = (type) => {
    let val = appState.currentSheet[type];
    if (type === 'month') val = appState.currentSheet.month.toString();

    openPicker(type, val, (newVal) => {
        if (type === 'month') appState.currentSheet.month = parseInt(newVal);
        else appState.currentSheet[type] = newVal;

        if (type === 'month' || type === 'year') renderAttendanceGrid();
        saveState();
        updateAllDropdowns();
    });
}

window.openGridTimePicker = (dateKey, hField, mField, hVal, mVal) => {
    let cur = (hVal && mVal) ? `${hVal}:${mVal}` : '';
    openPicker('time', cur, (val) => {
        const [h, m] = val.split(':');
        updateAttendance(dateKey, hField, h);
        updateAttendance(dateKey, mField, m);
    });
}

window.openGridPicker = (dateKey, field, type, val) => {
    openPicker(type, val, (newVal) => updateAttendance(dateKey, field, newVal));
}

// --- Attendance Grid ---
function renderAttendanceGrid() {
    const container = document.getElementById('attendance-list');
    if (!container) return;
    container.innerHTML = '';

    const s = appState.currentSheet;
    const days = getDaysInMonth(s.year, s.month);

    for (let i = 1; i <= days; i++) {
        const dateKey = `${s.year}-${String(parseInt(s.month) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dateObj = new Date(s.year, s.month, i);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const isFri = dayName === 'Fri';

        let defInH = '01', defInAmPm = 'PM', defOutH = '10', defOutAmPm = 'PM';

        if (isRamadan(dateObj)) {
            defInH = '07';
            defOutH = '01'; defOutAmPm = 'AM';
        }

        let d = s.attendance[dateKey] || { inHour: defInH, inMin: '00', inAmPm: defInAmPm, outHour: defOutH, outMin: '00', outAmPm: defOutAmPm, remarks: '' };

        if (!s.attendance[dateKey]) d = { ...d };

        const row = document.createElement('div');
        row.className = `attendance-day ${isFri ? 'weekend' : ''}`;

        const timeHTML = (h, m, ap, hKey, mKey, apKey) => {
            const dis = !!d.remarks;
            return `
            <div class="select-box time-box${dis ? ' disabled' : ''}" ${dis ? '' : `onclick="openGridTimePicker('${dateKey}', '${hKey}', '${mKey}', '${h}', '${m}')"`}><span>${(h && m) ? h + ':' + m : '--:--'}</span></div>
            <div class="select-box ampm-box${dis ? ' disabled' : ''}" ${dis ? '' : `onclick="openGridPicker('${dateKey}', '${apKey}', 'ampm', '${ap}')"`}><span>${ap || '--'}</span></div>
        `;
        };

        row.innerHTML = `
            <div class="row-top">
                <div class="day-info"><span>${i}</span><small>${dayName}</small></div>
                <div class="time-group">${timeHTML(d.inHour, d.inMin, d.inAmPm, 'inHour', 'inMin', 'inAmPm')}</div>
                <div class="time-group">${timeHTML(d.outHour, d.outMin, d.outAmPm, 'outHour', 'outMin', 'outAmPm')}</div>
                <div class="select-box remark-select" onclick="openGridPicker('${dateKey}', 'remarks', 'remarks', '${d.remarks}')">
                    <span>${d.remarks || '-'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                </div>
            </div>
        `;
        container.appendChild(row);
    }
    refreshIcons();
}

// --- Time Calculation Logic ---
function calculateLogoutTime(dateKey, inH, inM, inAp) {
    if (!inH || !inM || !inAp) return null;

    let h = parseInt(inH);
    if (inAp === 'PM' && h !== 12) h += 12;
    if (inAp === 'AM' && h === 12) h = 0;

    let totalMin = (h * 60) + parseInt(inM);

    // Ramadan Check
    const parts = dateKey.split('-');
    const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
    const shiftHours = isRamadan(dateObj) ? 6 : 9;

    totalMin += (shiftHours * 60);

    // Wrap around 24h (though unlikely for 9h shift starting morning)
    if (totalMin >= 1440) totalMin -= 1440;

    let outH = Math.floor(totalMin / 60);
    let outM = totalMin % 60;
    let outAp = 'AM';

    if (outH >= 12) {
        outAp = 'PM';
        if (outH > 12) outH -= 12;
    }
    if (outH === 0) outH = 12;

    return {
        outHour: String(outH).padStart(2, '0'),
        outMin: String(outM).padStart(2, '0'),
        outAmPm: outAp
    };
}

function validateTimeLogic(dateKey, d) {
    if (!d.inHour || !d.outHour) return;

    const to24 = (h, m, ap) => {
        let hr = parseInt(h);
        if (ap === 'PM' && hr !== 12) hr += 12;
        if (ap === 'AM' && hr === 12) hr = 0;
        return (hr * 60) + parseInt(m);
    };

    const inTime = to24(d.inHour, d.inMin, d.inAmPm);
    const outTime = to24(d.outHour, d.outMin, d.outAmPm);

    if (outTime <= inTime) {
        // Allow midnight crossing? "must be a +time" usually implies same day unless night shift.
        // Assuming standard shift for now.
        showMessage('Time Error', 'Logout time must be AFTER Login time.', 'warning');
    }
}

function updateAttendance(key, field, val) {
    if (!appState.currentSheet.attendance[key]) {
        appState.currentSheet.attendance[key] = { inHour: '01', inMin: '00', inAmPm: 'PM', outHour: '10', outMin: '00', outAmPm: 'PM', remarks: '' };
    }
    appState.currentSheet.attendance[key][field] = val;

    const d = appState.currentSheet.attendance[key];

    // Logic 1: Auto-Calculate Logout if Login changes
    if (field === 'inHour' || field === 'inMin' || field === 'inAmPm') {
        const newOut = calculateLogoutTime(key, d.inHour, d.inMin, d.inAmPm);
        if (newOut) {
            d.outHour = newOut.outHour;
            d.outMin = newOut.outMin;
            d.outAmPm = newOut.outAmPm;
        }
    }

    // Logic 2: Validate if Logout changes (Manual Edit)
    if (field === 'outHour' || field === 'outMin' || field === 'outAmPm') {
        validateTimeLogic(key, d);
    }

    if (field === 'remarks') {
        if (val) {
            d.inHour = ''; d.inMin = ''; d.inAmPm = '';
            d.outHour = ''; d.outMin = ''; d.outAmPm = '';
        } else {
            const parts = key.split('-');
            const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);

            if (isRamadan(dateObj)) {
                d.inHour = '07'; d.inMin = '00'; d.inAmPm = 'PM';
                d.outHour = '01'; d.outMin = '00'; d.outAmPm = 'AM';
            } else {
                d.inHour = '01'; d.inMin = '00'; d.inAmPm = 'PM';
                d.outHour = '10'; d.outMin = '00'; d.outAmPm = 'PM';
            }
        }
    }

    saveState();
    renderAttendanceGrid();
}

// --- Settings ---
function renderSettingsList(id, arr, key) {
    const ul = document.getElementById(id);
    if (!ul) return;

    ul.innerHTML = '';
    arr.forEach((item, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${item}</span><button class="delete-btn" onclick="delSetting('${key}', ${idx})"><i data-lucide="trash-2"></i></button>`;
        ul.appendChild(li);
    });
    refreshIcons();
}

window.delSetting = (key, idx) => {
    const map = { retailers: 'Retailer', locations: 'Location', departments: 'Department', designations: 'Designation' };
    const label = map[key] || 'Option';
    showConfirm('Delete', `Remove this ${label}?`, () => {
        try {
            appState.settings[key].splice(idx, 1);
            saveState();
            updateAllDropdowns();
        } catch (e) {
            console.error("Delete failed", e);
        }
    });
}

function setupAddSetting(btnId, inpId, key) {
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inpId);
    if (!btn || !inp) return;

    const add = () => {
        const val = inp.value.trim();
        if (!val) {
            const map = { retailers: 'Retailer', locations: 'Location', departments: 'Department', designations: 'Designation' };
            const label = map[key] || 'value';
            showMessage('Start typing...', `Please enter a ${label} to add.`, 'warning');
            return inp.focus();
        }
        let clean;
        if (key === 'designations' && val.length <= 3) {
            clean = val.toUpperCase();
        } else {
            clean = val.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }
        if (appState.settings[key].includes(clean)) return showMessage('Error', 'Exists already', 'warning');
        appState.settings[key].push(clean);
        inp.value = '';
        saveState();
        updateAllDropdowns();
    };
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = add;
    inp.onkeypress = (e) => { if (e.key === 'Enter') add(); };
    inp.oninput = validateEnglishInput;
}

function resetToDefaults(confirm) {
    const run = () => {
        appState.currentSheet.attendance = {};
        renderAttendanceGrid();
        saveState();
        if (confirm) showMessage('Reset', 'Attendance cleared.', 'success');
    };
    if (confirm) showConfirm('Reset', 'Clear all attendance?', run);
    else run();
}

// --- Storage Monitor ---
function updateStorageMonitor() {
    try {
        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
            }
        }
        const sizeKB = (totalSize / 1024).toFixed(2);
        const quotaKB = 5120; // 5MB estimate
        const percentage = Math.min((totalSize / 1024 / quotaKB * 100), 100).toFixed(1);

        const usedEl = document.getElementById('storageUsed');
        const barEl = document.getElementById('storageBar');
        const percentEl = document.getElementById('storagePercent');
        const countEl = document.getElementById('recordCount');

        if (usedEl) usedEl.textContent = `${sizeKB} KB`;
        if (percentEl) percentEl.textContent = `${percentage}%`;
        if (countEl) countEl.textContent = appState.savedSheets?.length || 0;

        if (barEl) {
            barEl.style.width = `${percentage}%`;
            if (percentage > 80) barEl.style.background = '#ef4444';
            else if (percentage > 60) barEl.style.background = '#f59e0b';
            else barEl.style.background = 'linear-gradient(90deg, var(--primary), var(--primary-light))';
        }
    } catch (error) { }
}

function updateOnlineStatus() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        if (navigator.onLine) {
            indicator.style.display = 'none';
        } else {
            indicator.style.display = 'flex';
            refreshIcons();
        }
    }
}

// FIX: Updated updateStats to trim spaces (Fixes Mobile Bug)
function updateStats(targetMonth, targetYear) {
    try {
        if (targetMonth === undefined || targetYear === undefined) {
            if (typeof currentCalendarDate !== 'undefined') {
                targetMonth = currentCalendarDate.getMonth();
                targetYear = currentCalendarDate.getFullYear();
            } else {
                return;
            }
        }

        const workingDaysEl = document.getElementById('statsWorkingDays');
        const presentEl = document.getElementById('statsPresent');
        const sickLeaveEl = document.getElementById('statsSickLeave');
        const compOffEl = document.getElementById('statsCompOff');

        if (!workingDaysEl || !presentEl || !sickLeaveEl || !compOffEl) return;

        workingDaysEl.textContent = '0';
        presentEl.textContent = '0';
        sickLeaveEl.textContent = '0';
        compOffEl.textContent = '0';

        if (!appState.savedSheets || appState.savedSheets.length === 0) return;

        // FIX: Trim Input
        const empName = document.getElementById('empName')?.value?.trim();

        const relevantSheets = appState.savedSheets.filter(s =>
            s.month == targetMonth &&
            s.year == targetYear &&
            // FIX: Trim Saved Data
            (!empName || (s.empName && s.empName.trim().toLowerCase() === empName.toLowerCase()))
        );

        if (relevantSheets.length === 0) return;

        const mergedData = {};
        [...relevantSheets].reverse().forEach(sheet => {
            if (!sheet.attendance) return;
            Object.keys(sheet.attendance).forEach(key => {
                mergedData[key] = sheet.attendance[key];
            });
        });

        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        let workingDays = 0;
        let present = 0;
        let sickLeave = 0;
        let compOff = 0;

        for (let i = 1; i <= daysInMonth; i++) {
            const dateKey = `${targetYear}-${String(parseInt(targetMonth) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const record = mergedData[dateKey];
            let remark = "";
            if (record) remark = (record.remarks || "").trim();

            const isWeeklyOff = remark === 'Weekly Off';
            const isWorkingDay = !isWeeklyOff;

            if (isWorkingDay) {
                workingDays++;
                if (remark === 'Sick Leave') sickLeave++;
                else if (remark === 'Comp Off') compOff++;
                else if (remark !== "") { }
                else if (record && record.inHour && record.outHour) present++;
                else if (!record || remark === "") present++;
            }
        }

        workingDaysEl.textContent = workingDays;
        presentEl.textContent = present;
        sickLeaveEl.textContent = sickLeave;
        compOffEl.textContent = compOff;

    } catch (error) { }
}

// FIX: Updated validateRequiredFields to trim Name on Save
function validateRequiredFields() {
    ['empName', 'civilId'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            let val = el.value;
            if (id === 'civilId') val = val.replace(/\D/g, '').slice(0, 12);

            // FIX: Trim Name specifically
            if (id === 'empName') val = val.trim();

            appState.currentSheet[id] = val;
        }
    });

    const s = appState.currentSheet;
    const missing = [];
    const warnings = [];

    if (!s.empName || !s.empName.trim()) missing.push('Employee Name');
    if (!s.civilId || !s.civilId.trim()) missing.push('Civil ID');
    else if (!/^\d{12}$/.test(s.civilId.trim())) missing.push('Civil ID (Must be 12 digits)');

    if (!s.retailer || !s.retailer.trim()) missing.push('Retailer');
    if (!s.location || !s.location.trim()) missing.push('Location');
    if (!s.department || !s.department.trim()) missing.push('Department');
    if (!s.designation || !s.designation.trim()) missing.push('Designation');

    if (s.empName && s.empName.trim().length < 2) warnings.push('Employee Name should be at least 2 characters');

    if (s.civilId && s.month !== undefined && s.year) {
        const duplicate = appState.savedSheets?.find(sheet =>
            sheet.civilId === s.civilId &&
            sheet.month == s.month &&
            sheet.year == s.year
        );
        if (duplicate) warnings.push(`Record already exists for ${MONTH_NAMES[s.month]} ${s.year}. Saving will update it.`);
    }

    const timeErrors = [];
    Object.keys(s.attendance || {}).forEach(dateKey => {
        const att = s.attendance[dateKey];
        if (att.inHour && att.outHour && !att.remarks) {
            const inTime = convertTo24Hour(att.inHour, att.inMin, att.inAmPm);
            const outTime = convertTo24Hour(att.outHour, att.outMin, att.outAmPm);

            if (outTime < inTime && outTime > 6) {
                const day = dateKey.split('-')[2];
                timeErrors.push(`Day ${day}: Checkout before checkin`);
            }
        }
    });

    if (timeErrors.length > 0) {
        let msg = '<ul style="text-align: left; margin-top: 0.5rem; padding-left: 1.5rem; color: #ef4444;">';
        // Show first 5 errors max to avoid huge modal
        timeErrors.slice(0, 5).forEach(err => msg += `<li>${err}</li>`);
        if (timeErrors.length > 5) msg += `<li>...and ${timeErrors.length - 5} more</li>`;
        msg += '</ul>';

        showMessage('Validation Error', `<b>Cannot proceed with invalid times:</b><br>${msg}`, 'error', true);
        return false;
    }

    if (missing.length > 0) {
        let msg = '<ul style="text-align: left; margin-top: 0.5rem; padding-left: 1.5rem;">';
        missing.forEach(field => msg += `<li>${field}</li>`);
        msg += '</ul>';
        showMessage('Missing Information', `Please fill the following fields:<br>${msg}`, 'warning', true);
        return false;
    }

    if (warnings.length > 0) {
        let msg = '<ul style="text-align: left; margin-top: 0.5rem; padding-left: 1.5rem; font-size: 0.9rem;">';
        warnings.forEach(warn => msg += `<li>${warn}</li>`);
        msg += '</ul>';
        showMessage('Warnings', msg, 'warning', true);
    }

    return true;
}

function convertTo24Hour(hour, min, ampm) {
    let h = parseInt(hour);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return (h * 60) + parseInt(min || '0');
}

// --- Data Backup & Restore ---
function exportData() {
    if (!window.XLSX) {
        showMessage('Error', 'Excel library not loaded. Please refresh.', 'error');
        return;
    }
    const hasData = appState.savedSheets && appState.savedSheets.length > 0;
    if (!hasData) {
        showMessage('No Backup', 'No attendance data found to backup.', 'warning');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        const summaryData = [];
        summaryData.push(['Month', 'Year', 'Employee Name', 'Civil ID', 'Department', 'Designation', 'Location', 'Retailer', 'Date', 'Day', 'Login', 'Logout', 'Status/Remarks']);
        const sorted = [...appState.savedSheets].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

        sorted.forEach(sheet => {
            const monthName = MONTH_NAMES[sheet.month];
            const year = sheet.year;
            if (sheet.attendance) {
                Object.keys(sheet.attendance).forEach(dateKey => {
                    const att = sheet.attendance[dateKey];
                    const parts = dateKey.split('-');
                    const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
                    const dateStr = dateObj.toLocaleDateString('en-GB');
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

                    let login = (att.inHour) ? `${att.inHour}:${att.inMin} ${att.inAmPm}` : '-';
                    let logout = (att.outHour) ? `${att.outHour}:${att.outMin} ${att.outAmPm}` : '-';
                    let status = att.remarks || 'Present';

                    summaryData.push([monthName, year, sheet.empName || '', sheet.civilId || '', sheet.department || '', sheet.designation || '', sheet.location || '', sheet.retailer || '', dateStr, dayName, login, logout, status]);
                });
            }
        });

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Attendance");

        const settingsData = [['Type', 'Value']];
        ['retailers', 'locations', 'departments', 'designations'].forEach(key => {
            if (appState.settings[key]) {
                appState.settings[key].forEach(val => {
                    settingsData.push([key, val]);
                });
            }
        });
        const wsSettings = XLSX.utils.aoa_to_sheet(settingsData);
        XLSX.utils.book_append_sheet(wb, wsSettings, "Settings");

        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Employee_Attendance_Backup_${date}.xlsx`);
        showMessage('Backup Success', 'Backup downloaded successfully.', 'success');
    } catch (e) {
        console.error('Export failed:', e);
        showMessage('Error', 'Failed to create backup.', 'error');
    }
}

function importData(file) {
    if (!window.XLSX) {
        showMessage('Error', 'Excel library not loaded.', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const newSettings = JSON.parse(JSON.stringify(defaultState.settings));
            if (wb.Sheets["Settings"]) {
                const sJson = XLSX.utils.sheet_to_json(wb.Sheets["Settings"]);
                if (sJson.length > 0) {
                    newSettings.retailers = []; newSettings.locations = [];
                    newSettings.departments = []; newSettings.designations = [];
                    sJson.forEach(row => {
                        const type = row['Type'];
                        const val = row['Value'];
                        if (type && val && newSettings[type]) {
                            if (!newSettings[type].includes(val)) newSettings[type].push(val);
                        }
                    });
                }
            }
            const newSavedSheets = [];
            const sheetName = wb.Sheets["Attendance"] ? "Attendance" : (wb.Sheets["View_Data"] ? "View_Data" : null);

            if (sheetName) {
                const rawData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
                const groups = {};
                rawData.forEach(row => {
                    const mIdx = MONTH_NAMES.indexOf(row['Month']);
                    const year = row['Year'];
                    const civilId = row['Civil ID'];
                    if (mIdx === -1 || !year) return;
                    const cID = civilId || 'UNKNOWN';
                    const key = `${mIdx}_${year}_${cID}`;
                    if (!groups[key]) {
                        groups[key] = {
                            id: Date.now() + Math.random().toString(),
                            month: mIdx, year: year,
                            empName: row['Employee Name'] || row['Employee'], civilId: civilId || '',
                            department: row['Department'] || '', designation: row['Designation'] || '',
                            location: row['Location'] || '', retailer: row['Retailer'] || '',
                            createdDate: new Date().toISOString(), attendance: {}
                        };
                    }
                    const dStr = row['Date'];
                    if (dStr) {
                        const dParts = dStr.split('/');
                        if (dParts.length === 3) {
                            const yyyy = dParts[2]; const mm = dParts[1]; const dd = dParts[0];
                            const dateKey = `${yyyy}-${mm}-${dd}`;
                            const parseTime = (str) => {
                                if (!str || str === '-') return { h: '', m: '', ap: '' };
                                const [time, ap] = str.split(' ');
                                const [h, m] = time.split(':');
                                return { h, m, ap };
                            };
                            const inT = parseTime(row['Login']);
                            const outT = parseTime(row['Logout']);
                            const rem = (row['Status/Remarks'] === 'Present') ? '' : row['Status/Remarks'];
                            groups[key].attendance[dateKey] = {
                                inHour: inT.h, inMin: inT.m, inAmPm: inT.ap,
                                outHour: outT.h, outMin: outT.m, outAmPm: outT.ap,
                                remarks: rem
                            };
                        }
                    }
                });
                Object.values(groups).forEach(g => newSavedSheets.push(g));
            } else {
                throw new Error("No 'Attendance' sheet found.");
            }
            if (newSavedSheets.length === 0) throw new Error("No valid records found in file.");

            appState.settings = newSettings;
            appState.savedSheets = newSavedSheets;
            appState.currentSheet = JSON.parse(JSON.stringify(defaultState.currentSheet));
            saveState();
            showMessage('Restore Success', 'Data restored successfully.', 'success');
            setTimeout(() => location.reload(), 2000);
        } catch (ex) {
            console.error('Import error:', ex);
            showMessage('Error', 'Failed to restore: ' + ex.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- PDF Generator ---
function generatePDF(action = 'save', optionalData = null) {
    const isDirect = optionalData && optionalData.attendance;
    if (!isDirect && !validateRequiredFields()) return;

    const s = isDirect ? optionalData : appState.currentSheet;

    if (!isDirect && action === 'save') {
        saveToHistory(s);
    }

    const btn = document.getElementById(action === 'print' ? 'printBtn' : 'saveBtn');
    const oldText = btn ? btn.innerHTML : '';
    if (btn && !isDirect) {
        btn.innerHTML = action === 'print' ? 'Generating...' : 'Saving...';
        btn.disabled = true;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ format: 'a4', unit: 'pt' });
        const days = getDaysInMonth(s.year, s.month);

        doc.setFillColor(240, 240, 240);
        doc.rect(40, 55, 515, 30, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text("Monthly Timesheet", 50, 75);

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");

        const labelX_L = 40; const valX_L = 130;
        const labelX_R = 350; const valX_R = 430;
        const startY = 115; const gap = 15;

        const drawRow = (y, l1, v1, l2, v2) => {
            doc.setFont("helvetica", "bold");
            doc.text(l1, labelX_L, y);
            doc.text(l2, labelX_R, y);
            doc.setFont("helvetica", "normal");
            doc.text(v1 || '', valX_L, y);
            doc.text(v2 || '', valX_R, y);
        };

        const workLoc = [s.retailer, s.location].filter(Boolean).join(' ');
        drawRow(startY, "Employee Name:", s.empName, "Location:", workLoc);
        drawRow(startY + gap, "Civil ID No.:", s.civilId, "Department:", s.department);
        drawRow(startY + gap * 2, "Month:", `${MONTH_NAMES[s.month]} ${s.year}`, "Designation:", s.designation);

        const tableBody = [];
        for (let i = 1; i <= days; i++) {
            const k = `${s.year}-${String(parseInt(s.month) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(s.year, s.month, i);
            const defs = getDefaultTimes(dateObj);
            let d = s.attendance[k] ? s.attendance[k] : { ...defs, remarks: '' };
            const dateStr = `${String(i).padStart(2, '0')}-${MONTH_NAMES[s.month].substr(0, 3)}-${s.year}`;

            let tIn = '';
            if (d.inHour) tIn = `${d.inHour}:${d.inMin || '00'} ${d.inAmPm || 'AM'}`;
            let tOut = '';
            if (d.outHour) tOut = `${d.outHour}:${d.outMin || '00'} ${d.outAmPm || 'PM'}`;
            tableBody.push([dateStr, dateObj.toLocaleDateString('en-US', { weekday: 'long' }), tIn, tOut, d.remarks || '']);
        }

        doc.autoTable({
            startY: 175,
            head: [['Date', 'Day', 'Login Time', 'Logout Time', 'Remarks']],
            body: tableBody,
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 2, right: 2, bottom: 2, left: 5 }, lineColor: [60, 60, 60], lineWidth: 0.5, textColor: 0, valign: 'middle' },
            headStyles: { fillColor: [64, 64, 64], textColor: 255, fontStyle: 'bold', lineColor: 255, lineWidth: 0.5, halign: 'center', minCellHeight: 25, valign: 'middle', cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 103, halign: 'left' }, 1: { cellWidth: 103, halign: 'left' }, 2: { cellWidth: 103, halign: 'left' }, 3: { cellWidth: 103, halign: 'left' }, 4: { cellWidth: 103, halign: 'left' } },
            margin: { left: 40, right: 40 },
            tableWidth: 515,
            didDrawCell: (data) => {
                if (data.section === 'head') {
                    const doc = data.doc; const cell = data.cell;
                    doc.setDrawColor(64, 64, 64); doc.setLineWidth(0.5);
                    doc.line(cell.x, cell.y, cell.x + cell.width, cell.y);
                    doc.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
                    if (data.column.index === 0) doc.line(cell.x, cell.y, cell.x, cell.y + cell.height);
                    if (data.column.index === data.table.columns.length - 1) doc.line(cell.x + cell.width, cell.y, cell.x + cell.width, cell.y + cell.height);
                }
            }
        });

        const finalY = doc.lastAutoTable.finalY + 40;
        doc.setFont("helvetica", "bold"); doc.setFontSize(11);
        doc.text("Verified by:", 40, finalY);

        const fname = `${s.empName.replace(/\s/g, '_')}_${MONTH_NAMES[s.month]}_Timesheet.pdf`;

        if (action === 'print') {
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            if (!isDirect) showMessage('Success', 'PDF Opened for Printing.', 'success');
        } else {
            const blob = doc.output('blob');
            const file = new File([blob], fname, { type: 'application/pdf' });
            const shareData = {
                files: [file],
                title: 'Attendance Sheet',
                text: `Attendance Sheet for ${MONTH_NAMES[s.month]} ${s.year}`
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                // Fix: Samsung/Android often fails if both text and files are sent. Sending only files + title.
                // Samsung Internet specifically might dislike Title + Files. Removing Title to be safe.
                navigator.share(shareData)
                    .then(() => { showMessage('Success', 'PDF Shared!', 'success'); })
                    .catch((e) => {
                        console.error("Share failed:", e);
                        // Fallback to download on ANY error (including AbortError/User Cancel/Browser Block)
                        doc.save(fname);
                        showMessage('Saved', 'Sharing failed or cancelled. File Downloaded.', 'success');
                    });
            } else {
                doc.save(fname);
                showMessage('Success', 'PDF Downloaded!', 'success');
            }
        }
    } catch (e) {
        console.error(e);
        if (!isDirect) showMessage('Error', 'PDF Generation Failed', 'error');
    } finally {
        if (btn && !isDirect) {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    }
}

function saveToHistory(current) {
    if (!appState.savedSheets) appState.savedSheets = [];
    const entry = JSON.parse(JSON.stringify(current));
    entry.id = Date.now().toString();
    entry.createdDate = new Date().toISOString();
    const existingIdx = appState.savedSheets.findIndex(x => x.month == entry.month && x.year == entry.year && x.civilId == entry.civilId);
    if (existingIdx >= 0) {
        entry.id = appState.savedSheets[existingIdx].id;
        appState.savedSheets[existingIdx] = entry;
    } else {
        appState.savedSheets.unshift(entry);
    }
    saveState();
    renderDataTab();
}

// --- Init & Listeners ---
function setupEventListeners() {
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.onclick = () => generatePDF('save');

    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.onclick = () => generatePDF('print');

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) clearBtn.onclick = () => resetToDefaults(true);

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.onclick = toggleTheme;

    const closePicker = document.getElementById('closePickerBtn');
    if (closePicker) closePicker.onclick = () => {
        document.getElementById('picker-modal').classList.add('hidden');
        document.body.classList.remove('no-scroll');
    };

    ['empName', 'civilId'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = appState.currentSheet[id] || '';
        el.oninput = (e) => {
            if (id === 'empName') validateEnglishInput(e);
            if (id === 'civilId') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
            appState.currentSheet[id] = e.target.value;
            saveState();
        };
    });

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
            b.classList.add('active');
            document.getElementById(b.dataset.tab).classList.add('active');
            if (b.dataset.tab === 'data') {
                setTimeout(() => { updateStats(); updateStorageMonitor(); }, 50);
            }
            if (window.lucide) window.lucide.createIcons();
        };
    });
    // --- Language Toggle Removed ---

    setupAddSetting('addRetailerBtn', 'newRetailer', 'retailers');
    setupAddSetting('addLocationBtn', 'newLocation', 'locations');
    setupAddSetting('addDeptBtn', 'newDept', 'departments');
    setupAddSetting('addDesigBtn', 'newDesig', 'designations');

    let startY = 0, ptr = document.getElementById('ptr-indicator');
    if (ptr) {
        window.ontouchstart = e => { if (document.body.classList.contains('no-scroll')) return; if (window.scrollY <= 5) startY = e.touches[0].clientY; };
        window.ontouchmove = e => { if (document.body.classList.contains('no-scroll')) return; if (startY && window.scrollY <= 5) { let diff = e.touches[0].clientY - startY; if (diff > 0) ptr.style.transform = `translateY(${Math.min(diff / 2, 80)}px)`; if (diff > 120) ptr.classList.add('release'); } };
        window.ontouchend = e => { if (ptr.classList.contains('release')) location.reload(); ptr.style.transform = ''; ptr.classList.remove('release'); startY = 0; };
    }

    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    if (clearAllDataBtn) {
        clearAllDataBtn.onclick = () => {
            if (!appState.savedSheets || appState.savedSheets.length === 0) { showMessage('No Data', 'There is no saved data to clear.', 'info'); return; }
            showConfirm('Clear All History?', 'This will delete all saved monthly sheets.', () => { appState.savedSheets = []; saveState(); renderDataTab(); renderCalendar(); updateStats(); updateStorageMonitor(); showMessage('Cleared', 'All history deleted.', 'success'); });
        };
    }

    const subTabList = document.getElementById('subTabList');
    const subTabCalendar = document.getElementById('subTabCalendar');
    if (subTabList) subTabList.onclick = () => switchDataSubTab('list');
    if (subTabCalendar) subTabCalendar.onclick = () => switchDataSubTab('calendar');

    const closePreviewBtn = document.getElementById('closePreviewBtn');
    if (closePreviewBtn) closePreviewBtn.onclick = () => document.getElementById('preview-modal').classList.add('hidden');

    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) backupBtn.onclick = exportData;

    const restoreBtn = document.getElementById('restoreBtn');
    const restoreInput = document.getElementById('restoreInput');
    if (restoreBtn && restoreInput) {
        restoreBtn.onclick = () => restoreInput.click();
        restoreInput.onchange = (e) => { if (e.target.files.length > 0) { showConfirm('Restore Data?', 'This will DELETE ALL current data and replace it with the backup. Continue?', () => { importData(e.target.files[0]); }, () => { restoreInput.value = ''; }); } };
    }

    const deleteAllBtn = document.getElementById('deleteAllBtn');
    const bdModal = document.getElementById('backup-delete-modal');
    if (deleteAllBtn && bdModal) {
        deleteAllBtn.onclick = () => bdModal.classList.remove('hidden');
        document.getElementById('bd-cancel').onclick = () => bdModal.classList.add('hidden');
        document.getElementById('bd-delete-only').onclick = () => { bdModal.classList.add('hidden'); performClearAll(); };
        document.getElementById('bd-backup-delete').onclick = () => { bdModal.classList.add('hidden'); exportData(); setTimeout(() => { performClearAll(); }, 1000); };
    }
}

function performClearAll() {
    appState.savedSheets = [];
    appState.currentSheet = JSON.parse(JSON.stringify(defaultState.currentSheet));
    saveState();
    renderDataTab();
    renderAttendanceGrid();
    updateStats();
    updateStorageMonitor();
    showMessage('Success', 'All attendance data has been permanently deleted.', 'success');
}

function renderDataTab() {
    const container = document.getElementById('data-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (!appState.savedSheets || appState.savedSheets.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align: center; color: var(--text-muted); padding: 2rem;">No saved records found.</div>';
        return;
    }

    const sorted = [...appState.savedSheets].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

    sorted.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.margin = '0 0 1rem 0'; div.style.padding = '1rem'; div.style.display = 'flex'; div.style.flexDirection = 'column'; div.style.gap = '0.5rem';
        const date = new Date(item.createdDate).toLocaleDateString() + ' ' + new Date(item.createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h3 style="margin: 0; font-size: 1.1rem; color: var(--primary);">${MONTH_NAMES[item.month]} ${item.year}</h3>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Created: ${date}</div>
                    <div style="font-size: 0.9rem; margin-top: 4px;"><strong>${item.empName || 'No Name'}</strong></div>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button class="btn btn-secondary" onclick="openDataPreview('${item.id}')" style="flex: 1; font-size: 0.9rem; padding: 0.5rem;"><i data-lucide="eye"></i> View</button>
                <button class="btn btn-primary" onclick="downloadSaved('${item.id}')" style="flex: 1; font-size: 0.9rem; padding: 0.5rem;"><i data-lucide="share-2"></i> Share / PDF</button>
            </div>
        `;
        container.appendChild(div);
    });
    refreshIcons();
}

window.downloadSaved = (id) => {
    const item = appState.savedSheets.find(x => x.id === id);
    if (item) generatePDF('save', item);
}

let previewState = null;
window.openDataPreview = (id) => {
    const item = appState.savedSheets.find(x => x.id === id);
    if (!item) return;
    previewState = JSON.parse(JSON.stringify(item));
    const modal = document.getElementById('preview-modal');
    const body = document.getElementById('preview-body');
    const saveBtn = document.getElementById('previewSaveBtn');

    renderPreviewBody(body, previewState);
    saveBtn.onclick = () => {
        const idx = appState.savedSheets.findIndex(x => x.id === id);
        if (idx !== -1) {
            appState.savedSheets[idx] = previewState;
            saveState();
            renderDataTab();
            modal.classList.add('hidden');
            document.body.classList.remove('no-scroll');
            showMessage('Success', 'Entry updated.', 'success');
        }
    };
    modal.classList.remove('hidden');
    document.body.classList.add('no-scroll');
}

window.openPreviewHeader = (type) => {
    let val = previewState[type];
    if (type === 'month') val = previewState.month.toString();
    openPicker(type, val, (newVal) => {
        if (type === 'month') previewState.month = parseInt(newVal);
        else previewState[type] = newVal;
        renderPreviewBody(document.getElementById('preview-body'), previewState);
    });
}

function renderPreviewBody(container, data) {
    const infoHTML = `
        <div style="padding: 1rem;">
            <div class="form-group-row">
                <div class="form-group"><label>Employee Name</label><input type="text" value="${data.empName}" oninput="previewState.empName = this.value"></div>
                <div class="form-group"><label>Civil ID No.</label><input type="text" value="${data.civilId}" inputmode="numeric" maxlength="12" oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0,12); previewState.civilId = this.value"></div>
            </div>
            <div class="form-group-row">
                <div class="form-group"><label>Retailer</label><div class="select-box" onclick="openPreviewHeader('retailer')"><span>${data.retailer || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i></div></div>
                <div class="form-group"><label>Location</label><div class="select-box" onclick="openPreviewHeader('location')"><span>${data.location || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i></div></div>
            </div>
            <div class="form-group-row">
                <div class="form-group"><label>Department</label><div class="select-box" onclick="openPreviewHeader('department')"><span>${data.department || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i></div></div>
                <div class="form-group"><label>Designation</label><div class="select-box" onclick="openPreviewHeader('designation')"><span>${data.designation || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i></div></div>
            </div>
             <div class="form-group-row">
                <div class="form-group"><label>Month</label><div class="select-box" onclick="openPreviewHeader('month')"><span>${MONTH_NAMES[parseInt(data.month)] || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i></div></div>
                <div class="form-group"><label>Year</label><div class="select-box" onclick="openPreviewHeader('year')"><span>${data.year || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i></div></div>
        </div></div>`;

    const gridCols = '44px 100px 100px 1fr';
    let gridHTML = `<div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; border-top: 1px solid var(--border);"><div style="display: grid; grid-template-columns: ${gridCols}; gap: 0.25rem; padding: 0.75rem 0.5rem; background: var(--bg-card); border-bottom: 1px solid var(--border); font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; text-align: center; align-items: center; flex-shrink: 0; z-index: 10;"><span>Day</span><span>Login</span><span>Logout</span><span>Remarks</span></div><div class="attendance-list" style="overflow-y: auto; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0; background: var(--bg-surface);">`;

    const m = parseInt(data.month);
    const y = parseInt(data.year);
    const days = (m >= 0 && m < 12 && y > 2000) ? new Date(y, m + 1, 0).getDate() : 0;

    for (let i = 1; i <= days; i++) {
        const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dateObj = new Date(y, m, i);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const isFri = dayName === 'Fri';
        const defs = getDefaultTimes(dateObj);
        let d = data.attendance[k] || { ...defs, remarks: '' };

        gridHTML += `
            <div class="attendance-day ${isFri ? 'weekend' : ''}" style="border-bottom: 1px solid var(--border); display: grid; grid-template-columns: ${gridCols}; gap: 0.25rem; align-items: center; padding: 0.5rem; background: ${isFri ? 'rgba(239, 68, 68, 0.05)' : 'transparent'};">
                <div class="day-info" style="min-width: 0; width: 100%;"><span>${i}</span><small>${dayName}</small></div>
                <div class="time-group" style="width: 100%;"><div class="select-box time-box${d.remarks ? ' disabled' : ''}" style="padding: 4px;" ${d.remarks ? '' : `onclick="openPreviewTime('${k}', 'inHour', 'inMin', '${d.inHour}', '${d.inMin}')"`}><span style="font-size:0.85rem;">${(d.inHour && d.inMin) ? d.inHour + ':' + d.inMin : '--:--'}</span></div><div class="select-box ampm-box${d.remarks ? ' disabled' : ''}" style="flex: 0 0 38px; padding: 0;" ${d.remarks ? '' : `onclick="openPreviewSingle('${k}', 'inAmPm', 'ampm', '${d.inAmPm}')"`}><span style="font-size:0.7rem;">${d.inAmPm || '-'}</span></div></div>
                <div class="time-group" style="width: 100%;"><div class="select-box time-box${d.remarks ? ' disabled' : ''}" style="padding: 4px;" ${d.remarks ? '' : `onclick="openPreviewTime('${k}', 'outHour', 'outMin', '${d.outHour}', '${d.outMin}')"`}><span style="font-size:0.85rem;">${(d.outHour && d.outMin) ? d.outHour + ':' + d.outMin : '--:--'}</span></div><div class="select-box ampm-box${d.remarks ? ' disabled' : ''}" style="flex: 0 0 38px; padding: 0;" ${d.remarks ? '' : `onclick="openPreviewSingle('${k}', 'outAmPm', 'ampm', '${d.outAmPm}')"`}><span style="font-size:0.7rem;">${d.outAmPm || '-'}</span></div></div>
                <div class="select-box remark-select" style="min-width: 0; width: 100%; padding: 4px 8px;" onclick="openPreviewSingle('${k}', 'remarks', 'remarks', '${d.remarks}')"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem;">${d.remarks || '-'}</span><i data-lucide="chevron-down" class="select-icon" style="width: 14px; height: 14px;"></i></div>
            </div>`;
    }
    gridHTML += '</div></div>';
    container.innerHTML = infoHTML + gridHTML;
    refreshIcons();
}

window.openPreviewSingle = (key, field, type, cur) => {
    openPicker(type, cur, (val) => {
        const parts = key.split('-');
        const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
        const defs = getDefaultTimes(dateObj);
        if (!previewState.attendance[key]) previewState.attendance[key] = { ...defs, remarks: '' };
        previewState.attendance[key][field] = val;
        if (field === 'remarks') {
            if (val) {
                previewState.attendance[key].inHour = ''; previewState.attendance[key].inMin = ''; previewState.attendance[key].inAmPm = '';
                previewState.attendance[key].outHour = ''; previewState.attendance[key].outMin = ''; previewState.attendance[key].outAmPm = '';
            } else {
                previewState.attendance[key].inHour = defs.inHour; previewState.attendance[key].inMin = defs.inMin; previewState.attendance[key].inAmPm = defs.inAmPm;
                previewState.attendance[key].outHour = defs.outHour; previewState.attendance[key].outMin = defs.outMin; previewState.attendance[key].outAmPm = defs.outAmPm;
            }
        }
        renderPreviewBody(document.getElementById('preview-body'), previewState);
    });
}

window.openPreviewTime = (key, hField, mField, curH, curM) => {
    let cur = (curH && curM) ? `${curH}:${curM}` : '';
    openPicker('time', cur, (val) => {
        const [h, m] = val.split(':');
        const parts = key.split('-');
        const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
        const defs = getDefaultTimes(dateObj);
        if (!previewState.attendance[key]) previewState.attendance[key] = { ...defs, remarks: '' };
        previewState.attendance[key][hField] = h;
        previewState.attendance[key][mField] = m;
        renderPreviewBody(document.getElementById('preview-body'), previewState);
    });
}

// --- Initialize Offline Detection & Stats ---
if (typeof window !== 'undefined') {
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
}

function showSettingsPinModal(callback) {
    const modal = document.getElementById('settings-pin-modal');
    const input = document.getElementById('settingsPinInput');
    const error = document.getElementById('settingsPinError');
    const confirmBtn = document.getElementById('settings-pin-confirm');
    const cancelBtn = document.getElementById('settings-pin-cancel');
    if (!modal || !input) return;

    modal.classList.remove('hidden');
    input.value = ''; error.textContent = '';
    setTimeout(() => input.focus(), 100);

    const cleanup = () => { confirmBtn.onclick = null; cancelBtn.onclick = null; input.onkeydown = null; modal.classList.add('hidden'); };
    cancelBtn.onclick = cleanup;
    const handleConfirm = () => {
        const pin = input.value;
        if (pin.length !== 4) { error.textContent = 'Enter 4 digits'; return; }
        if (verifyPin(pin).success) { cleanup(); if (callback) callback(); } else { error.textContent = 'Incorrect PIN'; input.value = ''; input.focus(); }
    };
    confirmBtn.onclick = handleConfirm;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }
}

let currentCalendarDate = new Date();

function initCalendar() {
    renderCalendar();
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); renderCalendar(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); renderCalendar(); });
}

function switchDataSubTab(tab) {
    const listContainer = document.getElementById('data-list-container');
    const calendarContainer = document.getElementById('calendarContainer');
    const btnList = document.getElementById('subTabList');
    const btnCalendar = document.getElementById('subTabCalendar');
    if (tab === 'list') {
        if (listContainer) listContainer.style.display = 'block';
        if (calendarContainer) calendarContainer.style.display = 'none';
        if (btnList) btnList.classList.add('active');
        if (btnCalendar) btnCalendar.classList.remove('active');
    } else {
        if (listContainer) listContainer.style.display = 'none';
        if (calendarContainer) {
            calendarContainer.style.display = 'block';
            const s = appState.currentSheet;
            if (s && s.year && s.month !== undefined) currentCalendarDate = new Date(s.year, s.month, 1);
            renderCalendar();
        }
        if (btnList) btnList.classList.remove('active');
        if (btnCalendar) btnCalendar.classList.add('active');
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('currentMonthYear');
    if (!grid || !title) return;
    grid.innerHTML = '';
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    title.textContent = `${MONTH_NAMES[month]} ${year}`;
    updateStats(month, year);

    // FIX: Pass trim-corrected data
    const monthData = getMonthData(month, year);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    for (let i = 0; i < firstDay; i++) { const emptyCell = document.createElement('div'); emptyCell.className = 'calendar-day empty'; grid.appendChild(emptyCell); }
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.textContent = day;
        if (isCurrentMonth && day === today.getDate()) cell.classList.add('today');
        const status = monthData[day];
        if (status) { const dot = document.createElement('div'); dot.className = `day-status ${getStatusClass(status)}`; cell.appendChild(dot); }
        grid.appendChild(cell);
    }
}

// --- FIX: Trim logic added to getMonthData ---
function getMonthData(month, year) {
    const data = {};
    const empName = document.getElementById('empName')?.value?.trim(); // Trim input
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (!appState.savedSheets || !Array.isArray(appState.savedSheets)) return data;

    const relevantSheets = appState.savedSheets.filter(s =>
        s.month == month &&
        s.year == year &&
        // Trim saved name before comparing
        (!empName || (s.empName && s.empName.trim().toLowerCase() === empName.toLowerCase()))
    );

    if (relevantSheets.length === 0) return data;

    const mergedData = {};
    [...relevantSheets].reverse().forEach(sheet => {
        if (!sheet.attendance) return;
        Object.keys(sheet.attendance).forEach(key => { mergedData[key] = sheet.attendance[key]; });
    });

    for (let i = 1; i <= daysInMonth; i++) {
        const dateKey = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const record = mergedData[dateKey];
        if (!record) { data[i] = 'Present'; }
        else {
            const remark = (record.remarks || "").trim();
            if (remark === 'Weekly Off') { }
            else if (remark === 'Sick Leave') data[i] = 'Sick Leave';
            else if (remark === 'Comp Off') data[i] = 'Comp Off';
            else if (remark !== "") { }
            else if (record.inHour && record.outHour) data[i] = 'Present';
            else data[i] = 'Present';
        }
    }
    return data;
}

function getStatusClass(status) {
    switch (status) { case 'Present': return 'present'; case 'Sick Leave': return 'sick-leave'; case 'Comp Off': return 'comp-off'; default: return ''; }
}

function initPinEntry() {
    const pinInput = document.getElementById('pinEntryInput');
    const submitBtn = document.getElementById('pinSubmitBtn');
    const errMsg = document.getElementById('pinErrorMsg');
    if (!pinInput || !submitBtn) return;
    pinInput.value = ''; errMsg.textContent = '';
    setTimeout(() => pinInput.focus(), 200);

    const handleAuth = () => {
        const pin = pinInput.value;
        if (pin.length < 4) { errMsg.textContent = 'Enter 4-digit PIN'; return; }
        errMsg.textContent = 'Verifying...';
        if (window.pinAuthCallback) {
            const result = verifyPin(pin);
            if (result.success) {
                const cb = window.pinAuthCallback; window.pinAuthCallback = null;
                document.getElementById('pinModal').classList.add('hidden');
                cb();
            } else { errMsg.textContent = 'Incorrect PIN'; pinInput.value = ''; }
            return;
        }
        const rawData = safeStorage.getItem(STORE_KEY);
        if (isEncrypted(rawData)) {
            const success = loadState(pin);
            if (success) { sessionPin = pin; document.getElementById('pinModal').classList.add('hidden'); initApp(); }
            else { errMsg.textContent = 'Incorrect PIN (Decryption Failed)'; pinInput.value = ''; }
            return;
        }
        const result = verifyPin(pin);
        if (result.success) {
            sessionPin = pin; loadState(null); document.getElementById('pinModal').classList.add('hidden'); initApp();
        } else { errMsg.textContent = 'Incorrect PIN'; pinInput.value = ''; }
    };
    submitBtn.onclick = handleAuth;
    pinInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAuth(); } };
}

function showPinModal() {
    const modal = document.getElementById('pinModal');
    if (modal) { modal.classList.remove('hidden'); initPinEntry(); }
}



function initPinSettings() {
    if (window.pinSettingsInitialized) return;
    window.pinSettingsInitialized = true;
    const pinToggle = document.getElementById('pinLockToggle');
    const pinSetupSection = document.getElementById('pinSetupSection');
    const savePinBtn = document.getElementById('savePinBtn');
    const clearPinBtn = document.getElementById('clearPinBtn');
    const getPinInput = () => document.getElementById('pinSetupInput');

    function updatePinUI() {
        const hasPin = !!getStoredPinHash();
        const inputEl = getPinInput();
        if (hasPin && pinToggle) pinToggle.checked = true;
        if (pinSetupSection) {
            if (pinToggle && pinToggle.checked) {
                pinSetupSection.style.display = 'block';
                const inputContainer = inputEl?.parentElement;
                if (hasPin) { if (inputContainer) inputContainer.style.display = 'none'; if (savePinBtn) savePinBtn.style.display = 'none'; if (clearPinBtn) clearPinBtn.style.display = 'inline-flex'; }
                else { if (inputContainer) inputContainer.style.display = 'block'; if (savePinBtn) savePinBtn.style.display = 'inline-flex'; if (clearPinBtn) clearPinBtn.style.display = 'none'; if (inputEl && inputEl.offsetParent !== null && window.innerWidth > 600) { setTimeout(() => inputEl.focus(), 100); } }
            } else { pinSetupSection.style.display = 'none'; }
        }
    }
    updatePinUI();

    if (pinToggle) {
        pinToggle.onclick = function (e) {
            if (getStoredPinHash()) {
                if (!this.checked) {
                    e.preventDefault(); e.stopPropagation(); this.checked = true;
                    setTimeout(() => { if (document.getElementById('pinLockToggle')) document.getElementById('pinLockToggle').checked = true; }, 0);
                    showConfirm('Disable PIN Lock?', 'Are you sure you want to disable the PIN lock?', () => {
                        showSettingsPinModal(() => {
                            clearPin();
                            const el = document.getElementById('pinLockToggle'); if (el) el.checked = false;
                            const inputEl = getPinInput(); if (inputEl) inputEl.value = '';
                            updatePinUI(); showMessage('PIN Disabled', 'Security lock removed', 'success', false);
                        });
                    }, () => { });
                }
            } else { setTimeout(updatePinUI, 50); }
        };
    }

    if (savePinBtn) {
        savePinBtn.addEventListener('click', function () {
            const inputEl = getPinInput();
            if (!inputEl) return;
            let pin = inputEl.value.replace(/\D/g, '');
            inputEl.value = pin;
            if (pin.length !== 4) { showMessage('Invalid PIN', 'Please enter exactly 4 digits', 'warning', false); return; }
            setPin(pin);
            inputEl.value = ''; showMessage('PIN Saved', 'Your PIN has been set successfully', 'success', false); updatePinUI();
        });
    }

    const rawInput = getPinInput();
    if (rawInput) {
        rawInput.addEventListener('input', function () { this.value = this.value.replace(/[^0-9]/g, ''); });
        rawInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); savePinBtn.click(); } });
    }

    if (clearPinBtn) {
        clearPinBtn.addEventListener('click', function () {
            showConfirm('Clear PIN Lock?', 'Are you sure you want to remove your PIN lock?', () => {
                showSettingsPinModal(() => {
                    clearPin();
                    const inputEl = getPinInput(); if (inputEl) inputEl.value = '';
                    updatePinUI(); showMessage('PIN Cleared', 'PIN lock has been removed', 'success', false);
                });
            }, () => { });
        });
    }
}

// --- Init Section (Previously Missing) ---

function initApp() {
    try {
        console.log("Initializing App...");

        // 1. Load Settings or use Defaults (Sanity Check)
        if (!appState) appState = JSON.parse(JSON.stringify(defaultState));

        // 2. Data Structure Repair (if partial data exists)
        if (!appState.settings) appState.settings = JSON.parse(JSON.stringify(defaultState.settings));
        if (!appState.currentSheet) appState.currentSheet = JSON.parse(JSON.stringify(defaultState.currentSheet));
        if (!appState.savedSheets) appState.savedSheets = [];

        // Ensure all settings arrays exist
        ['retailers', 'locations', 'departments', 'designations'].forEach(key => {
            if (!appState.settings[key] || !Array.isArray(appState.settings[key])) {
                appState.settings[key] = defaultState.settings[key] || [];
            }
        });

        // 3. Initialize UI
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.style.display = 'block';

        initTheme();
        updateAllDropdowns();
        renderAttendanceGrid();
        refreshIcons();
        initPinSettings();
        if (typeof initCalendar === 'function') initCalendar();
        setupEventListeners();
        renderDataTab();

        window.appInitialized = true;
        console.log("App Initialized Successfully");

    } catch (err) {
        console.error("CRITICAL INIT ERROR:", err);
        const el = document.getElementById('attendance-list');
        if (el) {
            el.innerHTML = `<div style="padding: 2rem; color: #ef4444; text-align: center;">
                <h3>App Crash Detected</h3>
                <p>Please click 'Clear' or Refresh.</p>
                <small>${err.message}</small>
            </div>`;
        }
        alert("App failed to load: " + err.message);
    }
}

// --- Startup Logic ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    const raw = safeStorage.getItem(STORE_KEY);
    const pinEnabled = isPinEnabled();
    const hasData = !!raw;

    console.log("App Loading... Version 64 Check");

    // Case 1: Encrypted Data OR PIN Enabled -> Show PIN Screen
    if ((hasData && isEncrypted(raw)) || (pinEnabled && getStoredPinHash())) {
        document.getElementById('pinModal').classList.remove('hidden');

        // Setup PIN Entry logic
        const input = document.getElementById('pinEntryInput');
        const submitBtn = document.getElementById('pinSubmitBtn');
        const errMsg = document.getElementById('pinErrorMsg');

        const attemptLogin = () => {
            const result = verifyPin(input.value);
            if (result.success) {
                sessionPin = input.value;
                document.getElementById('pinModal').classList.add('hidden');
                loadState(input.value); // Load with PIN
                initApp();
            } else {
                errMsg.textContent = 'Incorrect PIN';
            }
        };

        submitBtn.onclick = attemptLogin;
        input.onkeydown = (e) => { if (e.key === 'Enter') attemptLogin(); };

        // Focus input
        setTimeout(() => input.focus(), 200);

    } else {
        // Case 2: No PIN / Plain Text -> Load immediately
        loadState(null);
        initApp();
    }
});