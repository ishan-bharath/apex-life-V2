/* global Dexie */
/**
 * db.js - Apex Life V2 Data Engine
 */

const db = new Dexie("ApexLifeV2DB");

// Define Schema for V2 Public Elite (Evolution)
db.version(4).stores({
    tasks: "++id, date, label, type, time, detail, done, [date+type]",
    logs: "++id, date, type, value, source, timestamp", 
    ai_history: "++id, timestamp, role, content",
    goals: "++id, title, type, category, target, current, status", 
    metrics: "++id, date, height, weight, hr_rest, body_fat",
    settings: "id, value",
    profile: "id, name, age, weight, constraints, archetype",
    workouts: "++id, dayIndex, date, name, focus, intensity, exercises" // added date for specific overrides
});

const ApexDB = {
    db,

    async getSetting(key, defaultValue) {
        try {
            const s = await db.settings.get(key);
            return s ? s.value : defaultValue;
        } catch (e) { return defaultValue; }
    },

    async setSetting(key, value) {
        await db.settings.put({ id: key, value });
    },

    async getProfile() {
        return await db.profile.get("user_profile");
    },

    async saveProfile(profileData) {
        await db.profile.put({ id: "user_profile", ...profileData });
    },

    async getTasksForDate(date) {
        return await db.tasks.where('date').equals(date).toArray();
    },

    async addTask(task) {
        return await db.tasks.add({ done: false, detail: '', ...task });
    },

    async clearProtocolRange(startDate, endDate) {
        const tasks = await db.tasks.where('date').between(startDate, endDate, true, true).toArray();
        const ids = tasks.map(t => t.id);
        await db.tasks.bulkDelete(ids);
    },

    async toggleTask(id) {
        const task = await db.tasks.get(id);
        if (task) { await db.tasks.update(id, { done: !task.done }); }
    },

    async addLog(log) {
        return await db.logs.add({ 
            date: new Date().toISOString().split('T')[0], 
            timestamp: Date.now(), 
            ...log 
        });
    },

    async getGoals() {
        return await db.goals.toArray();
    },

    async addGoal(goal) {
        return await db.goals.add({ status: 'active', current: 0, ...goal });
    },

    async deleteGoal(id) {
        await db.goals.delete(id);
    },

    async saveWorkoutPlan(dayIndex, date, data) {
        const existing = await db.workouts.where('[dayIndex+date]').equals([dayIndex, date]).first();
        if (existing) {
            await db.workouts.update(existing.id, data);
        } else {
            await db.workouts.add({ dayIndex, date, ...data });
        }
    },

    async getWorkoutPlan(dayIndex, date) {
        // Try specific date first, then fallback to dayIndex
        let plan = await db.workouts.where('date').equals(date).first();
        if (!plan) plan = await db.workouts.where('dayIndex').equals(dayIndex).first();
        return plan;
    },

    async nuclearWipe() {
        await db.delete();
        localStorage.clear();
        location.reload();
    }
};

window.ApexDB = ApexDB;
