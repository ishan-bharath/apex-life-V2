/* global ApexDB, ApexIntegrations */
/**
 * app.js - Apex Life V2 "Public Elite" Orchestrator
 */

const App = {
    state: {
        activeTab: 'home',
        selectedDay: new Date().getDay(),
        selectedDate: new Date().toISOString().split('T')[0],
        scores: { career: 0, health: 0 },
        tasks: [],
        goals: [],
        messages: [],
        profile: null,
        settings: { retention: 30, apiKey: '' },
        metrics: { sleep: 5, recovery: 5 },
        isGenerating: false
    },

    // ─── INITIALIZATION ──────────────────────────────────────────────────────
    async init() {
        console.log("[Apex] Initializing Public Elite Protocol...");
        
        // 1. Check Onboarding
        const profile = await ApexDB.getProfile();
        if (!profile) {
            this.wizard.show();
            return;
        }
        this.state.profile = profile;

        // 2. Load Core Data
        await ApexDB.performHousekeeping();
        this.state.settings.retention = await ApexDB.getSetting("retention_days", 30);
        this.state.settings.apiKey = await ApexDB.getSetting("openrouter_key", "");

        // 3. Refresh & Render
        await this.refreshData();
        this.setupEventListeners();
        this.render();
        console.log("[Apex] Systems Online.");
    },

    async refreshData() {
        this.state.tasks = await ApexDB.getTasksForDate(this.state.selectedDate);
        this.state.goals = await ApexDB.getGoals();
        this.state.messages = await ApexDB.db.ai_history.orderBy('timestamp').toArray();
        await this.calculateScores();
    },

    async calculateScores() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoff = sevenDaysAgo.toISOString().split('T')[0];

        const recentTasks = await ApexDB.db.tasks.where('date').aboveOrEqual(cutoff).toArray();
        const careerTasks = recentTasks.filter(t => ['academic', 'project', 'career'].includes(t.type));
        const healthTasks = recentTasks.filter(t => ['workout', 'nutrition', 'recovery', 'hygiene'].includes(t.type));

        const getPct = (arr) => arr.length > 0 ? Math.round((arr.filter(t => t.done).length / arr.length) * 100) : 0;
        this.state.scores.career = getPct(careerTasks);
        this.state.scores.health = getPct(healthTasks);
    },

    // ─── ONBOARDING WIZARD ───────────────────────────────────────────────────
    wizard: {
        show() { document.getElementById('wizard-overlay').classList.remove('hidden'); },
        hide() { document.getElementById('wizard-overlay').classList.add('hidden'); },
        next(step) {
            document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
            document.getElementById(`step-${step}`).classList.add('active');
        },
        async skipAI() {
            document.getElementById('wiz-api-key').value = "";
            this.next(2);
        },
        async finish() {
            const profile = {
                name: document.getElementById('wiz-name').value || "ELITE",
                age: parseInt(document.getElementById('wiz-age').value) || 18,
                height: parseFloat(document.getElementById('wiz-weight').value) || 70,
                weight: parseFloat(document.getElementById('wiz-weight').value) || 70,
                constraints: document.getElementById('wiz-constraints').value || "None"
            };
            const goals = [
                { title: document.getElementById('wiz-goal-career').value || "Career Mastery", target: 100, current: 0, type: "career" },
                { title: document.getElementById('wiz-goal-health').value || "Peak Performance", target: 100, current: 0, type: "health" }
            ];
            const apiKey = document.getElementById('wiz-api-key').value;

            await ApexDB.saveProfile(profile);
            for (const g of goals) await ApexDB.addGoal(g);
            if (apiKey) await ApexDB.setSetting("openrouter_key", apiKey);

            this.hide();
            App.init();
        }
    },

    // ─── AI PROTOCOL GENERATION ──────────────────────────────────────────────
    async generateProtocol() {
        if (this.state.isGenerating) return;
        this.state.isGenerating = true;
        this.render();

        const apiKey = this.state.settings.apiKey;
        if (!apiKey) {
            console.log("[Apex] No Key. Loading Universal Template.");
            await this.seedTemplate();
        } else {
            await this.fetchAIProtocol(apiKey);
        }

        this.state.isGenerating = false;
        await this.refreshData();
        this.render();
    },

    async seedTemplate() {
        const today = this.state.selectedDate;
        const template = [
            {time:'05:00', label:'Wake up — no snooze', type:'routine'},
            {time:'05:15', label:'Elite Workout Session', type:'workout'},
            {time:'08:30', label:'Deep Work Block 1', type:'academic'},
            {time:'14:00', label:'Deep Work Block 2', type:'academic'},
            {time:'21:00', label:'Recovery & Journaling', type:'mental'},
            {time:'22:30', label:'Sleep Protocol', type:'sleep'}
        ];
        for (const item of template) {
            await ApexDB.addTask({ date: today, ...item });
        }
    },

    async fetchAIProtocol(key) {
        // Real fetch to OpenRouter with user context
        const prompt = `Generate a 1-day high-performance schedule for ${this.state.profile.name}. 
        Goals: ${this.state.goals.map(g => g.title).join(", ")}. 
        Constraints: ${this.state.profile.constraints}.
        Output ONLY a JSON array of tasks with keys: time (HH:MM), label, type (routine/workout/academic/nutrition/mental).`;

        try {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openrouter/free",
                    messages: [{ role: "system", content: prompt }]
                })
            });
            const data = await res.json();
            const tasks = JSON.parse(data.choices[0].message.content);
            for (const t of tasks) await ApexDB.addTask({ date: this.state.selectedDate, ...t });
        } catch (e) {
            console.error("[Apex] AI Generation Failed. Falling back to template.", e);
            await this.seedTemplate();
        }
    },

    // ─── UI ACTIONS ──────────────────────────────────────────────────────────
    setTab(tab) {
        this.state.activeTab = tab;
        this.render();
    },

    setDay(idx) {
        this.state.selectedDay = idx;
        const now = new Date();
        const diff = idx - now.getDay();
        const target = new Date(now);
        target.setDate(now.getDate() + diff);
        this.state.selectedDate = target.toISOString().split('T')[0];
        this.refreshData().then(() => this.render());
    },

    async toggleTask(id) {
        await ApexDB.toggleTask(id);
        await this.refreshData();
        this.render();
    },

    async addNewTask(label, type, time) {
        if (!label || !time) return;
        await ApexDB.addTask({ date: this.state.selectedDate, label, type, time });
        document.getElementById('new-task-label').value = '';
        document.getElementById('new-task-time').value = '';
        await this.refreshData();
        this.render();
    },

    async logMetric(type, val) {
        await ApexDB.addLog({ type, value: val, source: 'manual' });
        alert(`${type.toUpperCase()} logged: ${val}`);
        await this.refreshData();
        this.render();
    },

    async clearChat() {
        if (confirm("Clear all protocol history?")) {
            await ApexDB.db.ai_history.clear();
            this.state.messages = [];
            this.render();
        }
    },

    async sendCoachMessage(text) {
        if (!text || !this.state.settings.apiKey) return;
        const userMsg = { timestamp: Date.now(), role: 'user', content: text };
        await ApexDB.db.ai_history.add(userMsg);
        this.state.messages.push(userMsg);
        document.getElementById('chat-input').value = '';
        this.render();

        // Actual AI Response
        try {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${this.state.settings.apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openrouter/free",
                    messages: [
                        { role: "system", content: `You are APEX Coach for ${this.state.profile.name}. Be direct, elite, and brief.` },
                        ...this.state.messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
                    ]
                })
            });
            const data = await res.json();
            const aiMsg = { timestamp: Date.now(), role: 'assistant', content: data.choices[0].message.content };
            await ApexDB.db.ai_history.add(aiMsg);
            this.state.messages.push(aiMsg);
            this.render();
        } catch (e) { console.error("Chat Failed", e); }
    },

    async saveApiKeyFromSetup() {
        const val = document.getElementById('setup-api-key').value;
        if (val) {
            await ApexDB.setSetting("openrouter_key", val);
            this.state.settings.apiKey = val;
            alert("API KEY SECURED");
        }
    },

    async wipeData() {
        if (confirm("NUCLEAR WIPE: Vaporize all data and reset system?")) {
            await ApexDB.nuclearWipe();
        }
    },

    handleOAuthCallback() {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            if (token) {
                localStorage.setItem('google_token', token);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    },

    // ─── RENDER ENGINE ───────────────────────────────────────────────────────
    render() {
        const profile = this.state.profile;
        document.getElementById('user-display').innerText = profile ? `${profile.name} · PROTOCOL` : "UNINITIALIZED";
        
        // Tab & Day bar visibility
        const showDayBar = ['home', 'health'].includes(this.state.activeTab);
        document.getElementById('day-bar').classList.toggle('hidden', !showDayBar);
        document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('hidden', el.id !== `tab-${this.state.activeTab}`));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === this.state.activeTab));
        document.querySelectorAll('.day-btn').forEach((btn, idx) => btn.classList.toggle('active', idx === this.state.selectedDay));

        // Show Generate Alert if no tasks
        document.getElementById('gen-plan-alert').classList.toggle('hidden', this.state.tasks.length > 0 || this.state.isGenerating);

        // Scores
        document.getElementById('dash-career-score').innerText = `${this.state.scores.career}%`;
        document.getElementById('dash-health-score').innerText = `${this.state.scores.health}%`;

        // Task List
        const taskList = document.getElementById('task-list');
        if (taskList) {
            taskList.innerHTML = this.state.tasks.map(t => `
                <div class="glass-card p-4 flex items-center justify-between border-l-4 ${t.done ? 'border-green-500 opacity-40' : 'border-[#BA7517]'} transition-all">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[9px] font-mono text-gray-500">${t.time}</span>
                            <span class="text-[7px] px-1 py-0.5 rounded bg-white/5 text-gray-600 uppercase font-bold">${t.type}</span>
                        </div>
                        <p class="text-[13px] font-semibold ${t.done ? 'line-through text-gray-500' : ''}">${t.label}</p>
                    </div>
                    <button onclick="App.toggleTask(${t.id})" class="w-7 h-7 rounded-full border-2 ${t.done ? 'bg-green-500 border-green-500' : 'border-gray-800'} flex items-center justify-center transition-colors">
                        ${t.done ? '✓' : ''}
                    </button>
                </div>
            `).join('');
        }

        // Goals
        const goalList = document.getElementById('goal-list');
        if (goalList) {
            goalList.innerHTML = this.state.goals.map(g => `
                <div class="glass-card p-5">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-[9px] font-bold uppercase tracking-widest">${g.title}</span>
                        <span class="text-[9px] text-[#BA7517] font-mono">${g.current} / ${g.target}</span>
                    </div>
                    <div class="w-full bg-black/40 h-1 rounded-full overflow-hidden">
                        <div class="bg-[#BA7517] h-full transition-all duration-1000" style="width: ${Math.min((g.current/g.target)*100, 100)}%"></div>
                    </div>
                </div>
            `).join('');
        }

        // Chat
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.innerHTML = this.state.messages.map(m => `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-4">
                    <div class="max-w-[85%] p-3.5 rounded-2xl text-[12px] leading-relaxed ${m.role === 'user' ? 'bg-[#221606] border border-[#3d2208] text-[#f0a830]' : 'glass-card text-gray-200'}">
                        ${m.role === 'assistant' ? '<div class="text-[8px] font-bold text-[#BA7517] mb-1 uppercase tracking-widest font-mono">APEX COACH</div>' : ''}
                        ${m.content}
                    </div>
                </div>
            `).join('');
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        // Setup
        const rVal = document.getElementById('retention-val');
        const rSld = document.getElementById('retention-slider');
        if (rVal) rVal.innerText = `${this.state.settings.retention} DAYS`;
        if (rSld) rSld.value = this.state.settings.retention;
    },

    setupEventListeners() {
        const slider = document.getElementById('retention-slider');
        if (slider) slider.oninput = (e) => this.updateRetention(parseInt(e.target.value));
        const chatInp = document.getElementById('chat-input');
        if (chatInp) chatInp.onkeydown = (e) => { if (e.key === 'Enter') this.sendCoachMessage(chatInp.value); };
    }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
