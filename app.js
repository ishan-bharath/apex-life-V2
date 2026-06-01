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
        isGenerating: false
    },

    // ─── INITIALIZATION ──────────────────────────────────────────────────────
    async init() {
        console.log("[Apex] Initializing Protocol...");
        this.handleOAuthCallback();
        
        const profile = await ApexDB.getProfile();
        if (!profile) {
            this.wizard.show();
            return;
        }
        this.state.profile = profile;

        this.state.settings.retention = await ApexDB.getSetting("retention_days", 30);
        this.state.settings.apiKey = await ApexDB.getSetting("openrouter_key", "");

        await this.refreshData();
        this.setupEventListeners();
        this.render();
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
        addGoalRow() {
            const container = document.getElementById('wiz-goal-container');
            const row = document.createElement('div');
            row.className = "p-5 glass-inset space-y-3";
            row.innerHTML = `
                <select class="wiz-goal-type w-full bg-transparent text-[10px] font-black uppercase tracking-widest text-emerald-400 outline-none">
                    <option value="career">Career / Academic</option>
                    <option value="physical">Physical / Sports</option>
                    <option value="mental">Mental Health</option>
                    <option value="personal">Personal Goal</option>
                </select>
                <input class="wiz-goal-title w-full bg-black/20 border border-white/5 p-3 rounded-lg text-xs outline-none" placeholder="Target Objective...">
            `;
            container.appendChild(row);
        },
        async finish() {
            const name = document.getElementById('wiz-name').value;
            if (!name) { alert("Identify yourself, Elite."); return; }

            App.showLoading("Initializing Profile...");
            const profile = {
                name: name || "ELITE",
                age: parseInt(document.getElementById('wiz-age').value) || 18,
                weight: parseFloat(document.getElementById('wiz-weight').value) || 70,
                constraints: document.getElementById('wiz-constraints').value || "None",
                archetype: document.getElementById('wiz-archetype').value || "General"
            };

            const goalRows = document.querySelectorAll('#wiz-goal-container > div');
            const goals = [];
            goalRows.forEach(row => {
                const type = row.querySelector('.wiz-goal-type').value;
                const title = row.querySelector('.wiz-goal-title').value;
                if (title) goals.push({ title, type, category: type, target: 100, current: 0 });
            });

            const apiKey = document.getElementById('wiz-api-key').value;

            await ApexDB.saveProfile(profile);
            for (const g of goals) await ApexDB.addGoal(g);
            if (apiKey) await ApexDB.setSetting("openrouter_key", apiKey);

            this.hide();
            App.hideLoading();
            App.init();
        }
    },

    // ─── WEEKLY PROTOCOL GENERATION (HARDENED) ───────────────────────────────
    async generateWeeklyProtocol() {
        const constraints = document.getElementById('protocol-constraints').value;
        this.showLoading("Analyzing Goals & Constraints...");
        
        // 1. Clear existing range (Full 7 Days)
        const start = new Date();
        const end = new Date();
        end.setDate(start.getDate() + 6);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        
        await ApexDB.clearProtocolRange(startStr, endStr);

        const apiKey = this.state.settings.apiKey;
        if (!apiKey) {
            await this.seedWeeklyTemplate();
        } else {
            await this.fetchWeeklyAIProtocol(apiKey, constraints, startStr);
        }

        this.hideLoading();
        await this.refreshData();
        this.render();
    },

    async seedWeeklyTemplate() {
        const start = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            const template = [
                {time:'05:00', label:'Wake up — no snooze', type:'routine', detail:'Elite protocol start.'},
                {time:'05:15', label:'Personalized Workout', type:'workout', detail:'See Health tab.'},
                {time:'08:30', label:'Deep Work Block', type:'academic', detail:'Pomodoro 90 min.'},
                {time:'21:00', label:'System Recovery', type:'mental', detail:'Journal & Meditate.'},
                {time:'22:30', label:'Power Down', type:'sleep', detail:'Device blackout.'}
            ];
            for (const t of template) await ApexDB.addTask({ date: dateStr, ...t });
            
            await ApexDB.saveWorkoutPlan(date.getDay(), dateStr, {
                name: "Elite Baseline",
                focus: "Foundation",
                intensity: "Moderate",
                exercises: [
                    {n: "Pushups", s: 4, r: "Failure"},
                    {n: "Bodyweight Squats", s: 4, r: "25"},
                    {n: "Plank", s: 3, r: "60s"},
                    {n: "Burpees", s: 3, r: "15"}
                ]
            });
        }
    },

    async fetchWeeklyAIProtocol(key, constraints, startStr) {
        const blueprint = `
            05:00 - Rituals & Hydration
            05:15 - High-Intensity Activity
            08:30 - Mission Deep Work
            14:00 - Strategic Growth / Study
            21:00 - Recovery & Journal
            22:30 - Delta Sleep
        `;

        const prompt = `You are the APEX AI Intelligence. Refine the provided blueprint into a 7-day elite schedule for ${this.state.profile.name}.
        PROFILE: ${this.state.profile.archetype}, ${this.state.profile.weight}kg.
        GOALS: ${this.state.goals.map(g => g.title).join(", ")}.
        INJURIES/CONSTRAINTS: ${this.state.profile.constraints}.
        ADDITIONAL CONSTRAINTS FOR THIS WEEK: ${constraints}.
        
        BASE BLUEPRINT TO MODIFY:
        ${blueprint}

        CRITICAL RULES:
        1. Output ONLY a valid JSON object.
        2. "schedule": Array of 35-50 tasks across 7 days starting from ${startStr}. 
           Each task MUST have: date (YYYY-MM-DD), time (HH:MM), label, type, detail (2-sentence logic).
        3. "workouts": Array of 7 workout objects (one per day). 
           Each MUST have: dayIndex (0-6), name, focus, intensity, exercises: Array of 6-8 objects with keys {n,s,r}.
        4. Match archetype: If they are a ${this.state.profile.archetype}, the workout and routine must be specific to that (e.g. Swimmers get pool sets, Runners get intervals).
        5. Priority: Constraints like 'NCC Friday' MUST be in the schedule at correct slots.`;

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
            const result = JSON.parse(data.choices[0].message.content);
            
            for (const t of result.schedule) await ApexDB.addTask(t);
            for (const w of result.workouts) {
                const targetDate = result.schedule.find(t => new Date(t.date).getDay() === w.dayIndex)?.date || "";
                await ApexDB.saveWorkoutPlan(w.dayIndex, targetDate, w);
            }
        } catch (e) {
            console.error("AI Generation Failed", e);
            await this.seedWeeklyTemplate();
        }
    },

    // ─── UI ACTIONS ──────────────────────────────────────────────────────────
    setTab(tab) { this.state.activeTab = tab; this.render(); },

    setDay(idx) {
        this.state.selectedDay = idx;
        const now = new Date();
        const currentDay = now.getDay();
        const diff = idx - currentDay;
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
        await ApexDB.addTask({ date: this.state.selectedDate, label, type, time, detail: 'Manual addition.' });
        document.getElementById('new-task-label').value = '';
        document.getElementById('new-task-time').value = '';
        await this.refreshData();
        this.render();
    },

    async logMetric(type, val) {
        await ApexDB.addLog({ type, value: val, source: 'manual' });
        this.showLoading(`Logging ${type.toUpperCase()}...`);
        setTimeout(() => {
            this.hideLoading();
            this.refreshData().then(() => this.render());
        }, 300);
    },

    async addNewGoal() {
        const title = document.getElementById('new-goal-title').value;
        const type = document.getElementById('new-goal-type').value;
        if (title) {
            await ApexDB.addGoal({ title, type, category: type, target: 100, current: 0 });
            document.getElementById('new-goal-title').value = '';
            await this.refreshData();
            this.render();
        }
    },

    async deleteGoal(id) {
        if (confirm("Delete this objective?")) {
            await ApexDB.deleteGoal(id);
            await this.refreshData();
            this.render();
        }
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

        this.showLoading("Coach Analyzing...");
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
        } catch (e) { console.error("Chat Failed", e); }
        this.hideLoading();
        this.render();
    },

    async saveApiKeyFromSetup() {
        const val = document.getElementById('setup-api-key').value;
        if (val) {
            await ApexDB.setSetting("openrouter_key", val);
            this.state.settings.apiKey = val;
            this.showLoading("Protocol Secured.");
            setTimeout(() => this.hideLoading(), 500);
        }
    },

    async updateRetention(days) {
        this.state.settings.retention = days;
        await ApexDB.setSetting("retention_days", days);
        document.getElementById('retention-val').innerText = `${days} DAYS`;
    },

    async wipeData() {
        if (confirm("NUCLEAR WIPE: Vaporize all data and reset system?")) {
            await ApexDB.nuclearWipe();
        }
    },

    showLoading(text) {
        const el = document.getElementById('global-loading');
        if (el) {
            document.getElementById('loading-text').innerText = text;
            el.classList.remove('hidden');
        }
    },

    hideLoading() {
        const el = document.getElementById('global-loading');
        if (el) el.classList.add('hidden');
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
    async render() {
        const profile = this.state.profile;
        document.getElementById('user-display').innerText = profile ? `${profile.name} · PROTOCOL` : "UNINITIALIZED";
        
        const showDayBar = ['home', 'health'].includes(this.state.activeTab);
        document.getElementById('day-bar').classList.toggle('hidden', !showDayBar);
        document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('hidden', el.id !== `tab-${this.state.activeTab}`));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === this.state.activeTab));
        document.querySelectorAll('.day-btn').forEach((btn, idx) => btn.classList.toggle('active', idx === this.state.selectedDay));

        // Protocols visibility
        document.getElementById('gen-plan-alert').classList.toggle('hidden', this.state.tasks.length > 0);

        // Scores
        document.getElementById('dash-career-score').innerText = `${this.state.scores.career}%`;
        document.getElementById('dash-health-score').innerText = `${this.state.scores.health}%`;

        // Task List
        const taskList = document.getElementById('task-list');
        if (taskList) {
            taskList.innerHTML = this.state.tasks.length ? this.state.tasks.map(t => `
                <div class="glass-card p-5 flex items-center justify-between border-l-4 ${t.done ? 'border-emerald-500/30 opacity-40' : 'border-[#BA7517]'} transition-all">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-[10px] font-black font-mono text-gray-500">${t.time}</span>
                            <span class="text-[7px] px-2 py-0.5 rounded-full bg-white/5 text-gray-600 uppercase font-black tracking-widest">${t.type}</span>
                        </div>
                        <p class="text-[14px] font-bold ${t.done ? 'line-through text-gray-600' : 'text-gray-200'}">${t.label}</p>
                        ${t.detail ? `<p class="text-[10px] text-gray-500 mt-2 italic leading-relaxed border-t border-white/5 pt-2">${t.detail}</p>` : ''}
                    </div>
                    <button onclick="App.toggleTask(${t.id})" class="w-8 h-8 rounded-2xl border-2 ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-white/10'} flex items-center justify-center transition-all shadow-lg ml-4">
                        ${t.done ? '✓' : ''}
                    </button>
                </div>
            `).join('') : '<div class="text-center py-16 text-gray-700 text-xs font-mono uppercase tracking-[0.3em]">Protocol Standby</div>';
        }

        // Workout Plan
        const plan = await ApexDB.getWorkoutPlan(this.state.selectedDay, this.state.selectedDate);
        if (plan) {
            document.getElementById('workout-name').innerText = plan.name;
            document.getElementById('workout-note').innerText = plan.focus;
            document.getElementById('workout-intensity').innerText = plan.intensity;
            const exList = document.getElementById('exercise-list');
            exList.innerHTML = plan.exercises.map(ex => `
                <div class="p-4 glass-inset flex justify-between items-center border-l-2 border-emerald-500/20">
                    <span class="text-[12px] font-bold">${ex.n}</span>
                    <span class="text-[10px] font-black text-emerald-500 font-mono">${ex.s} SETS · ${ex.r}</span>
                </div>
            `).join('');
        }

        // Goals
        const goalList = document.getElementById('goal-list');
        const setupGoalList = document.getElementById('setup-goal-list');
        if (goalList) {
            const getColor = (c) => {
                const map = { career: 'blue', physical: 'emerald', mental: 'purple', personal: 'orange' };
                return map[c] || 'emerald';
            };
            const getHex = (c) => {
                const map = { career: '#3b82f6', physical: '#10b981', mental: '#a855f7', personal: '#f59e0b' };
                return map[c] || '#10b981';
            };
            
            goalList.innerHTML = this.state.goals.map(g => `
                <div class="glass-card p-6 border-b-2" style="border-color: ${getHex(g.category)}33">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">${g.title}</span>
                        <span class="text-[11px] font-black italic" style="color: ${getHex(g.category)}">${g.current}%</span>
                    </div>
                    <div class="w-full bg-black/40 h-1.5 rounded-full overflow-hidden shadow-inner">
                        <div class="h-full transition-all duration-1000 shadow-[0_0_15px_rgba(0,0,0,0.5)]" 
                             style="width: ${g.current}%; background-color: ${getHex(g.category)}"></div>
                    </div>
                </div>
            `).join('');
            
            if (setupGoalList) {
                setupGoalList.innerHTML = this.state.goals.map(g => `
                    <div class="flex justify-between items-center p-4 glass-inset">
                        <div class="flex flex-col">
                            <span class="text-[8px] font-black uppercase" style="color: ${getHex(g.category)}">${g.category}</span>
                            <span class="text-xs font-bold">${g.title}</span>
                        </div>
                        <button onclick="App.deleteGoal(${g.id})" class="text-[10px] text-red-500 font-bold uppercase">REMOVE</button>
                    </div>
                `).join('');
            }
        }

        // Chat
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.innerHTML = this.state.messages.map(m => `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-5">
                    <div class="max-w-[85%] p-4 rounded-3xl text-[12.5px] leading-relaxed ${m.role === 'user' ? 'bg-[#221606] border border-[#3d2208] text-[#f0a830] rounded-br-none shadow-lg' : 'glass-card text-gray-200 rounded-bl-none border-l-4 border-purple-500 shadow-xl'}">
                        ${m.role === 'assistant' ? '<div class="text-[8px] font-black text-purple-400 mb-2 uppercase tracking-widest font-mono italic">APEX_COACH</div>' : ''}
                        ${m.content}
                    </div>
                </div>
            `).join('');
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        // Setup inputs
        const hInp = document.getElementById('setup-api-key');
        if (hInp && this.state.settings.apiKey) hInp.placeholder = "••••••••••••••••";
    },

    setupEventListeners() {
        const slider = document.getElementById('retention-slider');
        if (slider) {
            slider.value = this.state.settings.retention;
            slider.oninput = (e) => this.updateRetention(parseInt(e.target.value));
        }
        const chatInp = document.getElementById('chat-input');
        if (chatInp) {
            chatInp.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    this.sendCoachMessage(chatInp.value);
                    chatInp.value = '';
                }
            };
        }
    }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
