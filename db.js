/* global Dexie */
/**
 * db.js - Apex Life V2 Data Engine
 */

const db = new Dexie("ApexLifeV2DB");

// Define Schema for V2 Public Elite (Evolution)
db.version(3).stores({
    tasks: "++id, date, label, type, time, detail, done, [date+type]",
    logs: "++id, date, type, value, source", // type: 'mood', 'sleep', 'recovery', 'workout', 'hydration'
    ai_history: "++id, timestamp, role, content",
    goals: "++id, title, target, current, type, category, status", // category: 'career','physical','mental','personal'
    metrics: "++id, date, height, weight, hr_rest, body_fat",
    settings: "id, value",
    profile: "id, name, age, height, weight, constraints, preferences",
    workouts: "++id, dayIndex, name, focus, exercises" // dayIndex 0-6, exercises is JSON array
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
        return await db.tasks.add({ done: false, ...task });
    },

    async toggleTask(id) {
        const task = await db.tasks.get(id);
        if (task) { await db.tasks.update(id, { done: !task.done }); }
    },

    async deleteTask(id) {
        await db.tasks.delete(id);
    },

    async addLog(log) {
        return await db.logs.add({ date: new Date().toISOString().split('T')[0], timestamp: Date.now(), ...log });
    },

    async getLatestMetrics() {
        return await db.metrics.orderBy('date').reverse().first();
    },

    async getGoals() {
        return await db.goals.toArray();
    },

    async addGoal(goal) {
        return await db.goals.add({ status: 'active', current: 0, ...goal });
    },

    async updateGoal(id, updates) {
        await db.goals.update(id, updates);
    },

    async deleteGoal(id) {
        await db.goals.delete(id);
    },

    async saveWorkoutPlan(dayIndex, data) {
        const existing = await db.workouts.where('dayIndex').equals(dayIndex).first();
        if (existing) {
            await db.workouts.update(existing.id, data);
        } else {
            await db.workouts.add({ dayIndex, ...data });
        }
    },

    async getWorkoutPlan(dayIndex) {
        return await db.workouts.where('dayIndex').equals(dayIndex).first();
    },

    async performHousekeeping() {
        const retention = await this.getSetting("retention_days", 30);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retention);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const cutoffTime = cutoff.getTime();

        console.log(`[Housekeeping] Pruning records older than ${retention} days...`);

        try {
            await Promise.all([
                db.tasks.where('date').below(cutoffStr).delete(),
                db.logs.where('date').below(cutoffStr).delete(),
                db.ai_history.where('timestamp').below(cutoffTime).delete(),
                db.metrics.where('date').below(cutoffStr).delete()
            ]);
        } catch (e) { console.error("[Housekeeping] Failure:", e); }
    },

    async nuclearWipe() {
        await db.delete();
        localStorage.clear();
        location.reload();
    }
};

window.ApexDB = ApexDB;
