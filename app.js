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

// --- Localization Config ---
const I18N = {
    en: {
        empName: "Employee Name", civilId: "Civil ID No.", retailer: "Retailer", location: "Location",
        department: "Department", designation: "Designation", month: "Month", year: "Year",
        day: "Day", login: "Login", logout: "Logout", remarks: "Remarks"
    },
    ar: {
        empName: "اسم الموظف", civilId: "الرقم المدني", retailer: "التاجر", location: "الموقع",
        department: "القسم", designation: "المسمى الوظيفي", month: "الشهر", year: "السنة",
        day: "اليوم", login: "وقت الدخول", logout: "وقت الخروج", remarks: "ملاحظات"
    }
};

let currentLang = localStorage.getItem('app_lang') || 'en';


let appState;
let sessionPin = null; // Stores key in memory only

// --- State Management : Load/Save with Encryption ---
function loadState(pin = null) {
    const raw = localStorage.getItem(STORE_KEY);

    // 1. No Data: Return Defaults
    if (!raw) {
        appState = JSON.parse(JSON.stringify(defaultState));
        return true;
    }

    try {
        // 2. Try Plain Text (Legacy or No PIN)
        appState = JSON.parse(raw);
        // If we have a PIN but data was plain, we should encrypt it on next save
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

// Secured saveState to prevent plaintext fallback
function saveState() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (!appState) return;
        try {
            let dataToSave;
            if (isPinEnabled()) {
                if (!sessionPin) {
                    // CRITICAL: Prevent saving plaintext if PIN is required but missing
                    // We check window.sessionPin just to be sure, but it should be GLOBAL sessionPin
                    // Actually, the global variable is 'sessionPin'.
                    console.error("Security Block: Session PIN missing. Save aborted.");
                    return;
                }
                // Encrypt
                dataToSave = CryptoJS.AES.encrypt(JSON.stringify(appState), sessionPin).toString();
            } else {
                // Plain Text
                dataToSave = JSON.stringify(appState);
            }
            localStorage.setItem(STORE_KEY, dataToSave);
            updateStorageMonitor();
        } catch (e) {
            // Silent fail - critical data loss prevention
        }
    }, 300);
}

// --- Security: Civil ID Obfuscation ---
const SECURITY_SALT = 'ATT3ND_S3CUR3_2024';

function obfuscateCivilId(civilId) {
    if (!civilId) return '';
    try {
        const combined = civilId + SECURITY_SALT;
        return btoa(combined);
    } catch (e) {
        return civilId;
    }
}

function deobfuscateCivilId(obfuscated) {
    if (!obfuscated) return '';
    try {
        const decoded = atob(obfuscated);
        return decoded.replace(SECURITY_SALT, '');
    } catch (e) {
        // If decoding fails, assume it's already plain text
        return obfuscated;
    }
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
    if (appState.currentSheet && (appState.currentSheet.empName || appState.currentSheet.civilId)) {
        appState.currentSheet = {
            empName: '', civilId: '', retailer: '', location: '', department: '', designation: '',
            month: new Date().getMonth(), year: new Date().getFullYear(),
            attendance: {}
        };
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
    // Keep legacy hash for basic auth check, but mainly rely on Encryption success
    return CryptoJS.SHA256(pin).toString();
}

function isPinEnabled() {
    return localStorage.getItem('app_pin_enabled') === 'true';
}

function getStoredPinHash() {
    return localStorage.getItem('app_pin_hash');
}

function verifyPin(enteredPin) {
    const storedHash = getStoredPinHash();
    const enteredHash = hashPin(enteredPin);
    return storedHash === enteredHash;
}

// Encryption Helpers
function encryptData(dataObj, pin) {
    if (!pin) return JSON.stringify(dataObj);
    try {
        const jsonStr = JSON.stringify(dataObj);
        return CryptoJS.AES.encrypt(jsonStr, pin).toString();
    } catch (e) {
        // Critical: Never return unencrypted data silently
        throw new Error('Encryption failed');
    }
}

function decryptData(ciphertext, pin) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, pin);
        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedData);
    } catch (e) {
        // console.error("Decryption Failed", e);
        return null;
    }
}

function isEncrypted(str) {
    return str && typeof str === 'string' && str.startsWith('U2FsdGVkX1'); // "Salted__" in Base64
}

// --- PIN Auth Adapter (Settings) ---
window.requestPinAuth = function (callback, titleStr, subStr) {
    window.pinAuthCallback = callback;

    // Optional: Update Modal Text if specific context is needed
    // const title = document.querySelector('#pinModal h2');
    // const sub = document.querySelector('#pinModal p');
    // if (title && titleStr) title.textContent = titleStr;
    // if (sub && subStr) sub.textContent = subStr;

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
// --- Modals ---
function showMessage(title, text, type = 'info', allowHtml = false) {
    const modal = document.getElementById('message-modal');
    document.getElementById('message-title').textContent = title;

    const textEl = document.getElementById('message-text');
    if (allowHtml) textEl.innerHTML = text;
    else textEl.textContent = text;

    const iconMap = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'x-circle' };
    const iconEl = document.getElementById('message-icon');
    iconEl.className = `message-icon ${type}`;
    iconEl.innerHTML = `<i data-lucide="${iconMap[type]}"></i>`;

    document.getElementById('message-buttons').innerHTML = `<button class="btn btn-primary" onclick="closeMessage()">OK</button>`;
    modal.classList.remove('hidden');
    refreshIcons();
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

    // Reset Listeners
    const newYes = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);

    const newNo = noBtn.cloneNode(true);
    noBtn.parentNode.replaceChild(newNo, noBtn);

    newYes.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (onYes) onYes();
    });

    newNo.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (onNo) onNo();
    });

    modal.classList.remove('hidden');
};

function closeMessage() {
    document.getElementById('message-modal').classList.add('hidden');
}

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

    // Create Date objects for range (at midnight)
    // Date string format is MM-DD, so we append Year
    const start = new Date(`${y}-${range.start}T00:00:00`);
    const end = new Date(`${y}-${range.end}T23:59:59`);

    // Check if dateObj falls within
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
    document.getElementById('retailerText').textContent = s.retailer || 'Select Retailer';
    document.getElementById('locationText').textContent = s.location || 'Select Location';
    document.getElementById('deptText').textContent = s.department || 'Select Department';
    document.getElementById('desigText').textContent = s.designation || 'Select Designation';
    document.getElementById('monthText').textContent = MONTH_NAMES[parseInt(s.month)] || 'Select Month';
    document.getElementById('yearText').textContent = s.year || 'Select Year';

    renderSettingsList('retailerList', appState.settings.retailers, 'retailers');
    renderSettingsList('locationList', appState.settings.locations, 'locations');
    renderSettingsList('deptList', appState.settings.departments, 'departments');
    renderSettingsList('desigList', appState.settings.designations, 'designations');
}

// --- Audio ---
let audioCtx = null;
function playTick() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // "Tik" Sound Synthesis
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.03);
}

// --- Picker ---
function openPicker(type, currentVal, callback) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const modal = document.getElementById('picker-modal');
    const body = document.getElementById('picker-body');
    const title = document.getElementById('picker-title');

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

    title.textContent = 'Select ' + type;

    let selectedValue = currentVal || (options[0] ? options[0].value : '');

    options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'picker-option';
        div.textContent = opt.label;
        div.dataset.value = opt.value;
        div.onclick = () => {
            // Just scroll to item on click
            const index = Array.from(body.children).indexOf(div);
            body.scrollTop = index * 50;
        };
        body.appendChild(div);
    });

    // Scroll Logic for Active State
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

    // Confirm Button Logic
    const confirmBtn = document.getElementById('pickerConfirmBtn');
    // Remove old listener to avoid duplicates
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.onclick = () => {
        callback(selectedValue);
        modal.classList.add('hidden');
        document.body.classList.remove('no-scroll');
    };

    // Ensure icon is visible after clone
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
    container.innerHTML = '';
    const s = appState.currentSheet;
    const days = getDaysInMonth(s.year, s.month);

    for (let i = 1; i <= days; i++) {
        const dateKey = `${s.year}-${String(parseInt(s.month) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dateObj = new Date(s.year, s.month, i);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const isFri = dayName === 'Fri';

        // Defaults
        // Normal: 01:00 PM - 10:00 PM
        // Ramadan: 07:00 PM - 01:00 AM
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

function updateAttendance(key, field, val) {
    if (!appState.currentSheet.attendance[key]) {
        appState.currentSheet.attendance[key] = { inHour: '01', inMin: '00', inAmPm: 'PM', outHour: '10', outMin: '00', outAmPm: 'PM', remarks: '' };
    }
    appState.currentSheet.attendance[key][field] = val;

    if (field === 'remarks') {
        const d = appState.currentSheet.attendance[key];
        if (val) {
            // Clear times if remark is selected
            d.inHour = ''; d.inMin = ''; d.inAmPm = '';
            d.outHour = ''; d.outMin = ''; d.outAmPm = '';
        } else {
            // Restore defaults if remark is cleared
            // Check Ramadan again
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
        appState.settings[key].splice(idx, 1);
        saveState();
        updateAllDropdowns();
    });
}

function setupAddSetting(btnId, inpId, key) {
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inpId);
    if (!btn) return;

    const add = () => {
        const val = inp.value.trim();
        if (!val) return inp.focus();
        let clean;
        // Special logic for Designations: <= 3 chars -> Uppercase (e.g. HR, VM, CEO)
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

            if (percentage > 80) {
                barEl.style.background = '#ef4444';
            } else if (percentage > 60) {
                barEl.style.background = '#f59e0b';
            } else {
                barEl.style.background = 'linear-gradient(90deg, var(--primary), var(--primary-light))';
            }
        }
    } catch (error) {
        console.error('Storage monitor error:', error);
    }
}

// --- Offline Detection ---
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


// --- Stats Dashboard ---

// --- Stats Dashboard ---
function updateStats(targetMonth, targetYear) {
    try {
        // Defaults if not provided (e.g. init)
        if (targetMonth === undefined || targetYear === undefined) {
            // Try to use current calendar date if available
            if (typeof currentCalendarDate !== 'undefined') {
                targetMonth = currentCalendarDate.getMonth();
                targetYear = currentCalendarDate.getFullYear();
            } else {
                return;
            }
        }

        // Check if elements exist
        const workingDaysEl = document.getElementById('statsWorkingDays');
        const presentEl = document.getElementById('statsPresent');
        const sickLeaveEl = document.getElementById('statsSickLeave');
        const compOffEl = document.getElementById('statsCompOff');

        if (!workingDaysEl || !presentEl || !sickLeaveEl || !compOffEl) {
            return;
        }

        workingDaysEl.textContent = '0';
        presentEl.textContent = '0';
        sickLeaveEl.textContent = '0';
        compOffEl.textContent = '0';

        if (!appState.savedSheets || appState.savedSheets.length === 0) return;

        const empName = document.getElementById('empName')?.value?.trim();

        // Find relevant sheets
        const relevantSheets = appState.savedSheets.filter(s =>
            s.month == targetMonth &&
            s.year == targetYear &&
            (!empName || (s.empName && s.empName.toLowerCase() === empName.toLowerCase()))
        );

        if (relevantSheets.length === 0) return;

        // Merge logic: Last saved wins for a specific day
        const mergedData = {};
        // Process sheets from oldest to newest to let newest overwrite
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
            const dateObj = new Date(targetYear, targetMonth, i);
            const dateKey = `${targetYear}-${String(parseInt(targetMonth) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const record = mergedData[dateKey];

            let remark = "";
            if (record) remark = (record.remarks || "").trim();

            // User Requirement: "Weekly Off" remark determines off days. 
            // Friday is working day unless marked as Weekly Off.
            // Implication: If no remark (even on Friday), it's a Working Day -> Present.

            const isWeeklyOff = remark === 'Weekly Off';
            const isWorkingDay = !isWeeklyOff;

            if (isWorkingDay) {
                workingDays++;

                // Determine Status
                if (remark === 'Sick Leave') {
                    sickLeave++;
                } else if (remark === 'Comp Off') {
                    compOff++;
                } else if (remark !== "") {
                    // Other remarks (Vacation etc) -> Not Present
                } else if (record && record.inHour && record.outHour) {
                    present++;
                } else if (!record || remark === "") {
                    // Implicit Present (Missing record or empty remark)
                    present++;
                }
            }
        }

        workingDaysEl.textContent = workingDays;
        presentEl.textContent = present;
        sickLeaveEl.textContent = sickLeave;
        compOffEl.textContent = compOff;


    } catch (error) {
        console.error('Stats calculation error:', error);
    }
}



// --- Validation ---
function validateRequiredFields() {
    const s = appState.currentSheet;
    const missing = [];
    const warnings = [];

    // Basic required fields
    if (!s.empName || !s.empName.trim()) missing.push('Employee Name');
    // Civil ID Validation: Must be present AND exactly 12 digits
    if (!s.civilId || !s.civilId.trim()) {
        missing.push('Civil ID');
    } else if (!/^\d{12}$/.test(s.civilId.trim())) {
        missing.push('Civil ID (Must be 12 digits)');
    }

    if (!s.retailer || !s.retailer.trim()) missing.push('Retailer');
    if (!s.location || !s.location.trim()) missing.push('Location');
    if (!s.department || !s.department.trim()) missing.push('Department');
    if (!s.designation || !s.designation.trim()) missing.push('Designation');

    // Enhanced: Employee name minimum 2 characters
    if (s.empName && s.empName.trim().length < 2) {
        warnings.push('Employee Name should be at least 2 characters');
    }

    // Removed warning-level check for Civil ID since it's now a blocker above

    // Enhanced: Check for duplicate records
    if (s.civilId && s.month !== undefined && s.year) {
        const duplicate = appState.savedSheets?.find(sheet =>
            sheet.civilId === s.civilId &&
            sheet.month == s.month &&
            sheet.year == s.year
        );

        if (duplicate) {
            warnings.push(`Record already exists for ${MONTH_NAMES[s.month]} ${s.year}. Saving will update it.`);
        }
    }

    // Enhanced: Time logic validation
    const timeErrors = [];
    Object.keys(s.attendance || {}).forEach(dateKey => {
        const att = s.attendance[dateKey];
        if (att.inHour && att.outHour && !att.remarks) {
            const inTime = convertTo24Hour(att.inHour, att.inAmPm);
            const outTime = convertTo24Hour(att.outHour, att.outAmPm);

            if (outTime < inTime && outTime > 6) {
                const day = dateKey.split('-')[2];
                timeErrors.push(`Day ${day}: Checkout before checkin`);
            }
        }
    });

    if (timeErrors.length > 0 && timeErrors.length <= 3) {
        warnings.push(...timeErrors);
    } else if (timeErrors.length > 3) {
        warnings.push(`${timeErrors.length} days have time issues`);
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

function convertTo24Hour(hour, ampm) {
    let h = parseInt(hour);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h;
}

// --- Data Backup & Restore (Excel XLSX) ---
// --- Data Backup & Restore (Excel XLSX) ---
function exportData() {
    if (!window.XLSX) {
        showMessage('Error', 'Excel library not loaded. Please refresh.', 'error');
        return;
    }

    // 1. Check STRICTLY for Attendance Data
    const hasData = appState.savedSheets && appState.savedSheets.length > 0;

    if (!hasData) {
        showMessage('No Backup', 'No attendance data found to backup.', 'warning');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // 2. SHEET 1: ATTENDANCE DATA (Readable & Reconstructible)
        // We MUST include Civil ID to identify unique employees during Restore
        const summaryData = [];
        summaryData.push(['Month', 'Year', 'Employee Name', 'Civil ID', 'Department', 'Designation', 'Location', 'Retailer', 'Date', 'Day', 'Login', 'Logout', 'Status/Remarks']);

        // Sort by recent
        const sorted = [...appState.savedSheets].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

        sorted.forEach(sheet => {
            const monthName = MONTH_NAMES[sheet.month];
            const year = sheet.year;

            if (sheet.attendance) {
                Object.keys(sheet.attendance).forEach(dateKey => {
                    const att = sheet.attendance[dateKey];
                    const parts = dateKey.split('-');
                    const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
                    const dateStr = dateObj.toLocaleDateString('en-GB'); // DD/MM/YYYY
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

                    let login = (att.inHour) ? `${att.inHour}:${att.inMin} ${att.inAmPm}` : '-';
                    let logout = (att.outHour) ? `${att.outHour}:${att.outMin} ${att.outAmPm}` : '-';
                    let status = att.remarks || 'Present';

                    summaryData.push([
                        monthName,
                        year,
                        sheet.empName || '',
                        sheet.civilId || '',
                        sheet.department || '',
                        sheet.designation || '',
                        sheet.location || '',
                        sheet.retailer || '',
                        dateStr,
                        dayName,
                        login,
                        logout,
                        status
                    ]);
                });
            }
        });

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Attendance");

        // 3. SHEET 2: SETTINGS (Preserve Config)
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

        // 4. Download
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
        showMessage('Error', 'Excel library not loaded. Please refresh.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });

            // 1. RESTORE SETTINGS
            const newSettings = JSON.parse(JSON.stringify(defaultState.settings)); // Start with defaults
            if (wb.Sheets["Settings"]) {
                const sJson = XLSX.utils.sheet_to_json(wb.Sheets["Settings"]);
                // Clear arrays first to strictly follow backup if valid settings exist
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

            // 2. RESTORE ATTENDANCE
            const newSavedSheets = [];

            // Try "Attendance" or fallback to "View_Data"
            const sheetName = wb.Sheets["Attendance"] ? "Attendance" : (wb.Sheets["View_Data"] ? "View_Data" : null);

            if (sheetName) {
                const rawData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

                // Group by Unique Sheet Identity: Month + Year + CivilID
                const groups = {};

                rawData.forEach(row => {
                    // Parse Month Name -> Index
                    const mIdx = MONTH_NAMES.indexOf(row['Month']);
                    const year = row['Year'];
                    const civilId = row['Civil ID']; // Critical Key

                    if (mIdx === -1 || !year) return;
                    // If View_Data (Old format) missing CivilID? Handled by empty string key?
                    // Ideally we need CivilID. If missing, grouping might merge different employees if they have same name?
                    // Risk: Old backup "View_Data" didn't have CivilID column. 
                    // But user just asked for this feature, so previous backups don't exist yet.

                    const cID = civilId || 'UNKNOWN';
                    const key = `${mIdx}_${year}_${cID}`;

                    if (!groups[key]) {
                        groups[key] = {
                            id: Date.now() + Math.random().toString(), // New ID
                            month: mIdx,
                            year: year,
                            empName: row['Employee Name'] || row['Employee'],
                            civilId: civilId || '',
                            department: row['Department'] || '',
                            designation: row['Designation'] || '',
                            location: row['Location'] || '',
                            retailer: row['Retailer'] || '',
                            createdDate: new Date().toISOString(),
                            attendance: {}
                        };
                    }

                    // Parse Date (DD/MM/YYYY)
                    const dStr = row['Date'];
                    if (dStr) {
                        const dParts = dStr.split('/'); // 0=DD, 1=MM, 2=YYYY
                        if (dParts.length === 3) {
                            const yyyy = dParts[2];
                            const mm = dParts[1];
                            const dd = dParts[0];

                            const dateKey = `${yyyy}-${mm}-${dd}`;

                            // Parse Times
                            const parseTime = (str) => {
                                if (!str || str === '-') return { h: '', m: '', ap: '' };
                                // "01:00 PM"
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

                // Convert Groups to Array
                Object.values(groups).forEach(g => newSavedSheets.push(g));
            } else {
                throw new Error("No 'Attendance' sheet found.");
            }

            if (newSavedSheets.length === 0) {
                throw new Error("No valid records found in file.");
            }

            // Commit Restore
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

// --- 1. UNIFIED PDF GENERATOR (Print & Save) ---
// action: 'save' | 'print'
// optionalData: For direct download of history items
function generatePDF(action = 'save', optionalData = null) {
    // Check if optionalData is a real data object (has 'attendance'), not an Event
    const isDirect = optionalData && optionalData.attendance;

    // Validate if creating new save (not downloading history)
    if (!isDirect && !validateRequiredFields()) return;

    const s = isDirect ? optionalData : appState.currentSheet;

    // IF Save from Main Tab (not direct download) -> Save to History
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

        // --- HEADER ---
        // Light Blue Background Stripe
        doc.setFillColor(220, 230, 241); // Business Light Blue
        doc.rect(40, 55, 515, 30, 'F');

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text("Monthly Timesheet", 50, 75);

        // --- INFO SECTION (Left & Right Groups) ---
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");

        const labelX_L = 40;
        const valX_L = 130;
        const labelX_R = 350;
        const valX_R = 430;

        const startY = 115;
        const gap = 15;

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

        // --- TABLE ---
        const tableBody = [];
        for (let i = 1; i <= days; i++) {
            const k = `${s.year}-${String(parseInt(s.month) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(s.year, s.month, i);
            const defs = getDefaultTimes(dateObj); // Smart Defaults Logic
            // FIX: If record exists in s.attendance[k], use it AS IS (even if empty).
            // Only use defaults if the record is completely missing (undefined).
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
            styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 1.6, lineColor: [200, 200, 200], lineWidth: 0.5, textColor: 0, valign: 'middle' },
            headStyles: { fillColor: [64, 64, 64], textColor: 255, fontStyle: 'bold', lineColor: 255, lineWidth: 0.5, halign: 'center', minCellHeight: 25, valign: 'middle' },
            columnStyles: {
                0: { cellWidth: 103, halign: 'left' },
                1: { cellWidth: 103, halign: 'left' },
                2: { cellWidth: 103, halign: 'left' },
                3: { cellWidth: 103, halign: 'left' },
                4: { cellWidth: 103, halign: 'left' }
            },
            margin: { left: 40, right: 40 },
            tableWidth: 515,
            didDrawCell: (data) => {
                if (data.section === 'head') {
                    const doc = data.doc;
                    const cell = data.cell;
                    // Overdraw Outer Borders with Dark Grey
                    doc.setDrawColor(64, 64, 64);
                    doc.setLineWidth(0.5);

                    // Top Border (All Header Cells)
                    doc.line(cell.x, cell.y, cell.x + cell.width, cell.y);

                    // Bottom Border (All Header Cells)
                    doc.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);

                    // Left Border (Only First Column)
                    if (data.column.index === 0) {
                        doc.line(cell.x, cell.y, cell.x, cell.y + cell.height);
                    }

                    // Right Border (Only Last Column)
                    if (data.column.index === data.table.columns.length - 1) {
                        doc.line(cell.x + cell.width, cell.y, cell.x + cell.width, cell.y + cell.height);
                    }
                }
            }
        });

        // --- FOOTER ---
        const finalY = doc.lastAutoTable.finalY + 40;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Verified by:", 40, finalY);

        const fname = `${s.empName.replace(/\s/g, '_')}_${MONTH_NAMES[s.month]}_Timesheet.pdf`;

        // --- OUTPUT LOGIC ---
        if (action === 'print') {
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            if (!isDirect) showMessage('Success', 'PDF Opened for Printing.', 'success');
        } else {
            // SAVE / SHARE
            const blob = doc.output('blob');
            const file = new File([blob], fname, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Monthly Timesheet',
                    text: `Timesheet for ${MONTH_NAMES[s.month]} ${s.year}.`,
                })
                    .then(() => { if (!isDirect) showMessage('Success', 'PDF Shared!', 'success'); })
                    .catch((e) => {
                        if (e.name !== 'AbortError') {
                            doc.save(fname);
                            if (!isDirect) showMessage('Saved', 'Downloaded (Share failed).', 'success');
                        }
                    });
            } else {
                doc.save(fname);
                if (!isDirect) showMessage('Success', 'PDF Downloaded!', 'success');
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

    const existingIdx = appState.savedSheets.findIndex(x =>
        x.month == entry.month &&
        x.year == entry.year &&
        x.civilId == entry.civilId
    );

    if (existingIdx >= 0) {
        entry.id = appState.savedSheets[existingIdx].id;
        appState.savedSheets[existingIdx] = entry;
    } else {
        appState.savedSheets.unshift(entry);
    }

    saveState();
    renderDataTab();
}

// --- Init ---
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
            if (id === 'civilId') {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
            }
            appState.currentSheet[id] = e.target.value;
            saveState();
        };
    });

    // Tab Listeners
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
            b.classList.add('active');
            document.getElementById(b.dataset.tab).classList.add('active');

            // Logic from old initializeApp: Update stats if Data tab
            if (b.dataset.tab === 'data') {
                setTimeout(() => {
                    updateStats();
                    updateStorageMonitor();
                }, 50);
            }

            // Refresh icons in case new content is shown
            if (window.lucide) window.lucide.createIcons();
        };
    });

    // Language Toggle
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.onclick = () => {
            currentLang = currentLang === 'en' ? 'ar' : 'en';
            localStorage.setItem('app_lang', currentLang);
            updateLanguage();
        };
        updateLanguage(); // Initial call
        // Ensure language is applied on startup
    }



    setupAddSetting('addRetailerBtn', 'newRetailer', 'retailers');
    setupAddSetting('addLocationBtn', 'newLocation', 'locations');
    setupAddSetting('addDeptBtn', 'newDept', 'departments');
    setupAddSetting('addDesigBtn', 'newDesig', 'designations');

    // Pull to Refresh
    let startY = 0, ptr = document.getElementById('ptr-indicator');
    if (ptr) {
        window.ontouchstart = e => {
            if (document.body.classList.contains('no-scroll')) return;
            if (window.scrollY <= 5) startY = e.touches[0].clientY;
        };
        window.ontouchmove = e => {
            if (document.body.classList.contains('no-scroll')) return;
            if (startY && window.scrollY <= 5) {
                let diff = e.touches[0].clientY - startY;
                if (diff > 0) ptr.style.transform = `translateY(${Math.min(diff / 2, 80)}px)`;
                if (diff > 120) ptr.classList.add('release');
            }
        };
        window.ontouchend = e => {
            if (ptr.classList.contains('release')) location.reload();
            ptr.style.transform = ''; ptr.classList.remove('release'); startY = 0;
        };
    }

    // Data Tab Listeners
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    if (clearAllDataBtn) {
        clearAllDataBtn.onclick = () => {
            if (!appState.savedSheets || appState.savedSheets.length === 0) {
                showMessage('No Data', 'There is no saved data to clear.', 'info');
                return;
            }
            showConfirm('Clear All History?', 'This will delete all saved monthly sheets. This cannot be undone.',
                () => {
                    appState.savedSheets = [];
                    saveState();
                    renderDataTab();
                    renderCalendar();
                    updateStats();
                    updateStorageMonitor();
                    showMessage('Cleared', 'All history deleted.', 'success');
                });
        };
    }

    const subTabList = document.getElementById('subTabList');
    const subTabCalendar = document.getElementById('subTabCalendar');
    if (subTabList) subTabList.onclick = () => switchDataSubTab('list');
    if (subTabCalendar) subTabCalendar.onclick = () => switchDataSubTab('calendar');

    const closePreviewBtn = document.getElementById('closePreviewBtn');
    if (closePreviewBtn) closePreviewBtn.onclick = () => document.getElementById('preview-modal').classList.add('hidden');

    // Backup & Restore
    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) backupBtn.onclick = exportData;

    const restoreBtn = document.getElementById('restoreBtn');
    const restoreInput = document.getElementById('restoreInput');
    if (restoreBtn && restoreInput) {
        restoreBtn.onclick = () => restoreInput.click();
        restoreInput.onchange = (e) => {
            if (e.target.files.length > 0) {
                showConfirm('Restore Data?', 'This will DELETE ALL current data and replace it with the backup. Continue?', () => {
                    importData(e.target.files[0]);
                }, () => {
                    restoreInput.value = ''; // Clear input if cancelled
                });
            }
        };
    }
    // --- Delete All Data (Danger Zone) ---
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    const bdModal = document.getElementById('backup-delete-modal');

    if (deleteAllBtn && bdModal) {
        deleteAllBtn.onclick = () => bdModal.classList.remove('hidden');

        document.getElementById('bd-cancel').onclick = () => bdModal.classList.add('hidden');

        document.getElementById('bd-delete-only').onclick = () => {
            bdModal.classList.add('hidden');
            performClearAll();
        };

        document.getElementById('bd-backup-delete').onclick = () => {
            bdModal.classList.add('hidden');
            // 1. Trigger Backup
            exportData();
            // 2. Clear Data (with slight delay to allow download trigger)
            setTimeout(() => {
                performClearAll();
            }, 1000);
        };
    }
}

function performClearAll() {
    appState.savedSheets = [];
    appState.currentSheet = JSON.parse(JSON.stringify(defaultState.currentSheet));

    saveState();
    renderDataTab();
    renderAttendanceGrid(); // Clear main grid
    updateStats();
    updateStorageMonitor();

    showMessage('Success', 'All attendance data has been permanently deleted.', 'success');
}

// --- Data Tab Logic ---

function renderDataTab() {
    const container = document.getElementById('data-list-container');
    container.innerHTML = '';

    if (!appState.savedSheets || appState.savedSheets.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align: center; color: var(--text-muted); padding: 2rem;">No saved records found.</div>';
        return;
    }

    // Sort by Date Descending
    const sorted = [...appState.savedSheets].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

    sorted.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.margin = '0 0 1rem 0';
        div.style.padding = '1rem';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.gap = '0.5rem';

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
                <button class="btn btn-primary" onclick="downloadSaved('${item.id}')" style="flex: 1; font-size: 0.9rem; padding: 0.5rem;"><i data-lucide="download"></i> Download</button>
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

// Temporary State for Edit Preview
let previewState = null;

window.openDataPreview = (id) => {
    const item = appState.savedSheets.find(x => x.id === id);
    if (!item) return;

    previewState = JSON.parse(JSON.stringify(item)); // Copy for editing

    const modal = document.getElementById('preview-modal');
    const body = document.getElementById('preview-body');
    const saveBtn = document.getElementById('previewSaveBtn');

    // Render Preview
    renderPreviewBody(body, previewState);

    // Wire Save
    saveBtn.onclick = () => {
        // Find index to update
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

    // Safety close handler
    const closeBtn = document.getElementById('closePreviewBtn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.add('hidden');
            document.body.classList.remove('no-scroll');
        }
    }
}

// Header Picker for Preview
window.openPreviewHeader = (type) => {
    let val = previewState[type];
    if (type === 'month') val = previewState.month.toString();

    openPicker(type, val, (newVal) => {
        if (type === 'month') previewState.month = parseInt(newVal);
        else previewState[type] = newVal;

        // If Month/Year changes, we technically should regenerate the grid blank structure? 
        // For now user just wants to edit text fields usually. 
        // If they change month/year, the days count might change. 
        // Let's re-render body completely.
        renderPreviewBody(document.getElementById('preview-body'), previewState);
    });
}

function renderPreviewBody(container, data) {
    // Header Info (Editable) - Replicating Main UI Layout
    const infoHTML = `
        <div style="padding: 1rem;">
            
            <div class="form-group-row">
                <div class="form-group">
                    <label>Employee Name</label>
                    <input type="text" value="${data.empName}" oninput="previewState.empName = this.value">
                </div>
                <div class="form-group">
                    <label>Civil ID No.</label>
                    <input type="text" value="${data.civilId}" inputmode="numeric" maxlength="12" oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0,12); previewState.civilId = this.value">
                </div>
            </div>

            <div class="form-group-row">
                <div class="form-group">
                    <label>Retailer</label>
                    <div class="select-box" onclick="openPreviewHeader('retailer')">
                        <span>${data.retailer || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                    </div>
                </div>
                <div class="form-group">
                    <label>Location</label>
                    <div class="select-box" onclick="openPreviewHeader('location')">
                        <span>${data.location || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                    </div>
                </div>
            </div>

            <div class="form-group-row">
                <div class="form-group">
                    <label>Department</label>
                    <div class="select-box" onclick="openPreviewHeader('department')">
                         <span>${data.department || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                    </div>
                </div>
                <div class="form-group">
                    <label>Designation</label>
                    <div class="select-box" onclick="openPreviewHeader('designation')">
                        <span>${data.designation || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                    </div>
                </div>
            </div>

             <div class="form-group-row">
                <div class="form-group">
                    <label>Month</label>
                    <div class="select-box" onclick="openPreviewHeader('month')">
                        <span>${MONTH_NAMES[parseInt(data.month)] || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                    </div>
                </div>
                <div class="form-group">
                    <label>Year</label>
                    <div class="select-box" onclick="openPreviewHeader('year')">
                        <span>${data.year || 'Select'}</span><i data-lucide="chevron-down" class="select-icon"></i>
                    </div>
                </div>
        </div>
    </div>
    `;

    // Grid - Maximized Width
    // Removed side margins to use full modal width.
    const gridCols = '44px 100px 100px 1fr';

    let gridHTML = `
    <!-- Grid Wrapper inside Modal Body -->
    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; border-top: 1px solid var(--border);">
        
        <!-- Header -->
        <div style="
            display: grid; 
            grid-template-columns: ${gridCols}; 
            gap: 0.25rem; 
            padding: 0.75rem 0.5rem; 
            background: var(--bg-card); 
            border-bottom: 1px solid var(--border);
            font-size: 0.7rem; 
            font-weight: 700; 
            color: var(--text-muted); 
            text-transform: uppercase; 
            text-align: center;
            align-items: center;
            flex-shrink: 0;
            z-index: 10;
        ">
            <span>Day</span><span>Login</span><span>Logout</span><span>Remarks</span>
        </div>

        <!-- Scrollable List -->
        <div class="attendance-list" style="
            overflow-y: auto; 
            padding: 0; 
            margin: 0; 
            display: flex; 
            flex-direction: column;
            gap: 0; 
            background: var(--bg-surface);
        ">`;

    // Safety check for dates
    const m = parseInt(data.month);
    const y = parseInt(data.year);
    // Handle invalid month/year gracefully
    const days = (m >= 0 && m < 12 && y > 2000) ? new Date(y, m + 1, 0).getDate() : 0;

    for (let i = 1; i <= days; i++) {
        const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dateObj = new Date(y, m, i);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const isFri = dayName === 'Fri';

        const defs = getDefaultTimes(dateObj);
        let d = data.attendance[k] || { ...defs, remarks: '' };

        gridHTML += `
            <div class="attendance-day ${isFri ? 'weekend' : ''}" style="
                border-bottom: 1px solid var(--border); 
                display: grid; 
                grid-template-columns: ${gridCols}; 
                gap: 0.25rem; 
                align-items: center; 
                padding: 0.5rem; 
                background: ${isFri ? 'rgba(239, 68, 68, 0.05)' : 'transparent'};
            ">
                <div class="day-info" style="min-width: 0; width: 100%;"><span>${i}</span><small>${dayName}</small></div>
                
                <div class="time-group" style="width: 100%;">
                    <div class="select-box time-box${d.remarks ? ' disabled' : ''}" style="padding: 4px;" ${d.remarks ? '' : `onclick="openPreviewTime('${k}', 'inHour', 'inMin', '${d.inHour}', '${d.inMin}')"`}><span style="font-size:0.85rem;">${(d.inHour && d.inMin) ? d.inHour + ':' + d.inMin : '--:--'}</span></div>
                    <div class="select-box ampm-box${d.remarks ? ' disabled' : ''}" style="flex: 0 0 38px; padding: 0;" ${d.remarks ? '' : `onclick="openPreviewSingle('${k}', 'inAmPm', 'ampm', '${d.inAmPm}')"`}><span style="font-size:0.7rem;">${d.inAmPm || '-'}</span></div>
                </div>

                <div class="time-group" style="width: 100%;">
                    <div class="select-box time-box${d.remarks ? ' disabled' : ''}" style="padding: 4px;" ${d.remarks ? '' : `onclick="openPreviewTime('${k}', 'outHour', 'outMin', '${d.outHour}', '${d.outMin}')"`}><span style="font-size:0.85rem;">${(d.outHour && d.outMin) ? d.outHour + ':' + d.outMin : '--:--'}</span></div>
                    <div class="select-box ampm-box${d.remarks ? ' disabled' : ''}" style="flex: 0 0 38px; padding: 0;" ${d.remarks ? '' : `onclick="openPreviewSingle('${k}', 'outAmPm', 'ampm', '${d.outAmPm}')"`}><span style="font-size:0.7rem;">${d.outAmPm || '-'}</span></div>
                </div>

                <div class="select-box remark-select" style="min-width: 0; width: 100%; padding: 4px 8px;" onclick="openPreviewSingle('${k}', 'remarks', 'remarks', '${d.remarks}')">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem;">${d.remarks || '-'}</span><i data-lucide="chevron-down" class="select-icon" style="width: 14px; height: 14px;"></i>
                </div>
            </div>
        `;
    }
    gridHTML += '</div></div>';

    container.innerHTML = infoHTML + gridHTML;
    refreshIcons();
}

// Preview Edit Logic checkers
window.openPreviewSingle = (key, field, type, cur) => {
    // Re-use openPicker but intercept callback
    openPicker(type, cur, (val) => {
        // Derive date from key for defaults
        const parts = key.split('-');
        const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
        const defs = getDefaultTimes(dateObj);

        if (!previewState.attendance[key]) previewState.attendance[key] = { ...defs, remarks: '' };

        previewState.attendance[key][field] = val;

        // Logic for remarks clearing times
        if (field === 'remarks') {
            if (val) {
                previewState.attendance[key].inHour = ''; previewState.attendance[key].inMin = ''; previewState.attendance[key].inAmPm = '';
                previewState.attendance[key].outHour = ''; previewState.attendance[key].outMin = ''; previewState.attendance[key].outAmPm = '';
            } else {
                previewState.attendance[key].inHour = defs.inHour; previewState.attendance[key].inMin = defs.inMin; previewState.attendance[key].inAmPm = defs.inAmPm;
                previewState.attendance[key].outHour = defs.outHour; previewState.attendance[key].outMin = defs.outMin; previewState.attendance[key].outAmPm = defs.outAmPm;
            }
        }

        // Re-render the body to show changes
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
// --- Initialize Offline Detection ---
if (typeof window !== 'undefined') {
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
}

// --- Language Helper ---
function updateLanguage() {
    const t = I18N[currentLang];
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        if (currentLang === 'en') {
            langToggle.textContent = 'ع';
            langToggle.style.fontSize = '1.4rem';
            langToggle.style.paddingBottom = '6px';
            langToggle.style.lineHeight = '1';
        } else {
            langToggle.textContent = 'EN';
            langToggle.style.fontSize = '0.9rem';
            langToggle.style.paddingBottom = '0';
            langToggle.style.lineHeight = '';
        }
    }
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
}

// --- Helper: Floating Settings PIN Modal ---
function showSettingsPinModal(callback) {
    const modal = document.getElementById('settings-pin-modal');
    const input = document.getElementById('settingsPinInput');
    const error = document.getElementById('settingsPinError');
    const confirmBtn = document.getElementById('settings-pin-confirm');
    const cancelBtn = document.getElementById('settings-pin-cancel');

    if (!modal || !input) return;

    modal.classList.remove('hidden');
    input.value = '';
    error.textContent = '';
    setTimeout(() => input.focus(), 100);

    const cleanup = () => {
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        input.onkeydown = null;
        modal.classList.add('hidden');
    };

    cancelBtn.onclick = cleanup;

    const handleConfirm = () => {
        const pin = input.value;
        if (pin.length !== 4) {
            error.textContent = 'Enter 4 digits';
            return;
        }

        if (verifyPin(pin)) {
            cleanup();
            if (callback) callback();
        } else {
            error.textContent = 'Incorrect PIN';
            input.value = '';
            input.focus();
        }
    };

    confirmBtn.onclick = handleConfirm;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    }
}

// --- Security: PIN Settings Event Listeners ---


// --- Calendar View Logic ---

let currentCalendarDate = new Date(); // Will be synced on switch

function initCalendar() {
    renderCalendar();

    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar();
        });
    }

    // Refresh calendar logic handled by switchDataView
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

            // Sync calendar date to current sheet if not already set
            const s = appState.currentSheet;
            if (s && s.year && s.month !== undefined) {
                // Check if currentCalendarDate is already set relevant to context?
                // Simple sync:
                currentCalendarDate = new Date(s.year, s.month, 1);
            }
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


    // Update Title
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    title.textContent = `${monthNames[month]} ${year}`;

    // Update stats for this month
    updateStats(month, year);

    // Get Data for this month
    const monthData = getMonthData(month, year);


    // Days calculation
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Today
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    // Empty cells for days before start of month
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.textContent = day;

        if (isCurrentMonth && day === today.getDate()) {
            cell.classList.add('today');
        }

        // Check for attendance status
        const status = monthData[day];
        if (status) {
            const dot = document.createElement('div');
            dot.className = `day-status ${getStatusClass(status)}`;
            cell.appendChild(dot);
        }

        grid.appendChild(cell);
    }
}



function getMonthData(month, year) {
    const data = {};
    const empName = document.getElementById('empName')?.value?.trim();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (!appState.savedSheets || !Array.isArray(appState.savedSheets)) return data;

    // Find relevant sheets
    const relevantSheets = appState.savedSheets.filter(s =>
        s.month == month &&
        s.year == year &&
        (!empName || (s.empName && s.empName.toLowerCase() === empName.toLowerCase()))
    );

    if (relevantSheets.length === 0) return data;

    // Merge records
    const mergedData = {};
    // Process Oldest -> Newest so Newest overwrites
    // savedSheets has Newest at index 0. So reverse() gives Oldest first.
    [...relevantSheets].reverse().forEach(sheet => {
        if (!sheet.attendance) return;
        Object.keys(sheet.attendance).forEach(key => {
            mergedData[key] = sheet.attendance[key];
        });
    });

    for (let i = 1; i <= daysInMonth; i++) {
        const dateObj = new Date(year, month, i);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        // Skip Fridays - REMOVED
        // if (dayName === 'Fri') continue;

        const dateKey = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const record = mergedData[dateKey];

        if (!record) {
            // Implicit Present (All days default to Working/Present)
            data[i] = 'Present';
        } else {
            const remark = (record.remarks || "").trim();
            if (remark === 'Weekly Off') {
                // Explicit Weekly Off -> No dot (skip this day)
            } else if (remark === 'Sick Leave') {
                data[i] = 'Sick Leave';
            } else if (remark === 'Comp Off') {
                data[i] = 'Comp Off';
            } else if (remark !== "") {
                // Other remark -> No dot
            } else if (record.inHour && record.outHour) {
                data[i] = 'Present';
            } else {
                // Record exists but empty remarks -> Present
                data[i] = 'Present';
            }
        }
    }

    return data;
}


function getStatusClass(status) {
    switch (status) {
        case 'Present': return 'present';
        case 'Sick Leave': return 'sick-leave';
        case 'Comp Off': return 'comp-off';
        default: return '';
    }
}


// --- App Startup: Check PIN & Encryption ---

function checkPinOnStartup() {
    // Logic moved to DOMContentLoaded for centralized handling
}

// --- PIN Logic ---
function initPinEntry() {
    const pinInput = document.getElementById('pinEntryInput');
    const submitBtn = document.getElementById('pinSubmitBtn');
    const errMsg = document.getElementById('pinErrorMsg');

    if (!pinInput || !submitBtn) return;

    // Clear previous
    pinInput.value = '';
    errMsg.textContent = '';

    // Focus after animation
    setTimeout(() => pinInput.focus(), 200);

    // Handler
    const handleAuth = () => {
        const pin = pinInput.value;
        if (pin.length < 4) {
            errMsg.textContent = 'Enter 4-digit PIN';
            return;
        }

        errMsg.textContent = 'Verifying...';

        // CASE A: Auth Callback (e.g. Clear PIN)
        if (window.pinAuthCallback) {
            if (verifyPin(pin)) {
                const cb = window.pinAuthCallback;
                window.pinAuthCallback = null;
                document.getElementById('pinModal').classList.add('hidden');
                cb();
            } else {
                errMsg.textContent = 'Incorrect PIN';
                pinInput.value = '';
            }
            return;
        }

        // CASE B: Startup Decryption / Auth
        // 1. Try Decryption (if data is encrypted)
        const rawData = localStorage.getItem(STORE_KEY);
        if (isEncrypted(rawData)) {
            const success = loadState(pin);
            if (success) {
                sessionPin = pin; // Store for future saves
                document.getElementById('pinModal').classList.add('hidden');
                initApp();
            } else {
                errMsg.textContent = 'Incorrect PIN (Decryption Failed)';
                pinInput.value = '';
            }
            return;
        }

        // 2. Legacy/Plain Data Auth (Hash Check)
        if (verifyPin(pin)) {
            sessionPin = pin; // Set session pin so next save encrypts it!
            loadState(null); // Load plain text
            document.getElementById('pinModal').classList.add('hidden');
            initApp();
        } else {
            errMsg.textContent = 'Incorrect PIN';
            pinInput.value = '';
        }
    };

    submitBtn.onclick = handleAuth;
    pinInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAuth();
        }
    };
}

function showPinModal() {
    const modal = document.getElementById('pinModal');
    if (modal) {
        modal.classList.remove('hidden');
        initPinEntry();
    }
}


// --- App Startup Flow ---
function initApp() {
    // Repair State if needed
    if (!appState) appState = JSON.parse(JSON.stringify(defaultState));
    if (!appState.settings) appState.settings = JSON.parse(JSON.stringify(defaultState.settings));

    ['retailers', 'locations', 'departments', 'designations'].forEach(key => {
        if (!appState.settings[key] || !Array.isArray(appState.settings[key])) {
            appState.settings[key] = defaultState.settings[key];
        }
    });

    // Show UI
    document.querySelector('.app-container').style.display = 'block';

    // Init Modules
    initTheme();
    updateAllDropdowns();
    renderAttendanceGrid();
    refreshIcons();
    initPinSettings();
    initCalendar();
    setupEventListeners();
    window.appInitialized = true;

    // Auto-save immediately if migrating to encryption
    if (sessionPin && !isEncrypted(localStorage.getItem(STORE_KEY))) {
        saveState(); // Will use sessionPin to encrypt
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Init Theme immediately for Lock Screen
    initTheme();

    const appContainer = document.querySelector('.app-container');
    if (appContainer) appContainer.style.display = 'none';

    // Check Encryption Status
    const raw = localStorage.getItem(STORE_KEY);
    const encrypted = isEncrypted(raw);
    const pinEnabled = isPinEnabled();

    if (encrypted || (pinEnabled && getStoredPinHash())) {
        showPinModal();
    } else {
        loadState(null);
        initApp();
    }
});

// --- Security: PIN Settings Event Listeners (FIXED) ---
function initPinSettings() {
    // Prevent double initialization
    if (window.pinSettingsInitialized) return;
    window.pinSettingsInitialized = true;

    const pinToggle = document.getElementById('pinLockToggle');
    const pinSetupSection = document.getElementById('pinSetupSection');
    const savePinBtn = document.getElementById('savePinBtn');
    const clearPinBtn = document.getElementById('clearPinBtn');

    // Dynamic getter for the input since we renamed it
    const getPinInput = () => document.getElementById('pinSetupInput');

    function updatePinUI() {
        // Robust check: If hash exists, treat as enabled (Auto-heal UI)
        const hasPin = !!getStoredPinHash();
        const inputEl = getPinInput();

        // If PIN is set, force toggle ON. 
        if (hasPin && pinToggle) {
            pinToggle.checked = true;
        }

        if (pinSetupSection) {
            if (pinToggle && pinToggle.checked) {
                pinSetupSection.style.display = 'block';

                const inputContainer = inputEl?.parentElement;

                if (hasPin) {
                    if (inputContainer) inputContainer.style.display = 'none';
                    if (savePinBtn) savePinBtn.style.display = 'none';
                    if (clearPinBtn) clearPinBtn.style.display = 'inline-flex';
                } else {
                    if (inputContainer) inputContainer.style.display = 'block';
                    if (savePinBtn) savePinBtn.style.display = 'inline-flex';
                    if (clearPinBtn) clearPinBtn.style.display = 'none';
                    // Focus if visible and not on mobile (to avoid keyboard jumping)
                    if (inputEl && inputEl.offsetParent !== null && window.innerWidth > 600) {
                        setTimeout(() => inputEl.focus(), 100);
                    }
                }

            } else {
                pinSetupSection.style.display = 'none';
            }
        }
    }

    // Initial Load
    updatePinUI();

    // Toggle PIN lock (ROBUST INTERCEPTION)
    if (pinToggle) {
        // Use onclick to ensure singular control
        pinToggle.onclick = function (e) {
            if (getStoredPinHash()) {
                if (!this.checked) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.checked = true;
                    setTimeout(() => { if (document.getElementById('pinLockToggle')) document.getElementById('pinLockToggle').checked = true; }, 0);
                    showConfirm(
                        'Disable PIN Lock?',
                        'Are you sure you want to disable the PIN lock?',
                        () => {
                            showSettingsPinModal(() => {
                                localStorage.removeItem('app_pin_hash');
                                localStorage.removeItem('app_pin_enabled');
                                // Success: Programmatically turn OFF
                                const el = document.getElementById('pinLockToggle');
                                if (el) el.checked = false;
                                const inputEl = getPinInput();
                                if (inputEl) inputEl.value = '';
                                updatePinUI();
                                showMessage('PIN Disabled', 'Security lock removed', 'success', false);
                            });
                        },
                        () => { }
                    );
                }
            } else {
                setTimeout(updatePinUI, 50);
            }
        };
    }

    // Save PIN
    if (savePinBtn) {
        savePinBtn.addEventListener('click', function () {
            const inputEl = getPinInput();
            if (!inputEl) return;
            let pin = inputEl.value.replace(/\D/g, '');
            inputEl.value = pin;
            if (pin.length !== 4) {
                showMessage('Invalid PIN', 'Please enter exactly 4 digits', 'warning', false);
                return;
            }
            const hash = hashPin(pin);
            localStorage.setItem('app_pin_hash', hash);
            localStorage.setItem('app_pin_enabled', 'true');
            sessionPin = pin;
            saveState();
            inputEl.value = '';
            showMessage('PIN Saved', 'Your PIN has been set successfully', 'success', false);
            updatePinUI();
        });
    }

    // Restrict PIN input to numbers only
    const rawInput = getPinInput();
    if (rawInput) {
        rawInput.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
        // Enter Key Support (Mobile "Go")
        rawInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                savePinBtn.click();
            }
        });
    }

    // Clear PIN Button Action
    if (clearPinBtn) {
        clearPinBtn.addEventListener('click', function () {
            showConfirm(
                'Clear PIN Lock?',
                'Are you sure you want to remove your PIN lock?',
                () => {
                    showSettingsPinModal(() => {
                        localStorage.removeItem('app_pin_hash');
                        localStorage.removeItem('app_pin_enabled');
                        sessionPin = null;

                        // Force Immediate Save (Bypass Debounce) to ensure encryption is removed
                        try {
                            localStorage.setItem(STORE_KEY, JSON.stringify(appState));
                            updateStorageMonitor();
                        } catch (e) { console.error('Force save failed', e); }

                        const inputEl = getPinInput();
                        if (inputEl) inputEl.value = '';
                        updatePinUI();
                        showMessage('PIN Cleared', 'PIN lock has been removed', 'success', false);
                    });
                },
                () => { }
            );
        });
    }
}

// --- Utility: Confirm Dialog ---
// (Confirmed Dialog Utility moved to line 406)