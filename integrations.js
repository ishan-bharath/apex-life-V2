/**
 * integrations.js - Apex Life V2 Integration Layer
 * Standardized OAuth 2.0 Flow & REST API Communications
 */

const ApexIntegrations = {
    // These IDs are intended to be set by the user or pre-configured for a hosted version.
    // For a public PWA, users can provide their own Client IDs in the Setup tab.
    configs: {
        google: { 
            clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com', 
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth'
        },
        polar: { 
            clientId: 'YOUR_POLAR_CLIENT_ID', 
            scope: 'accesslink.read_all',
            authUrl: 'https://flow.polar.com/oauth2/authorization'
        },
        strava: {
            clientId: 'YOUR_STRAVA_CLIENT_ID',
            scope: 'activity:read_all',
            authUrl: 'https://www.strava.com/oauth/authorize'
        },
        garmin: {
            clientId: 'YOUR_GARMIN_CLIENT_ID',
            authUrl: 'https://connect.garmin.com/oauthConfirm' // Garmin often needs a backend proxy
        }
    },

    /**
     * Standardized OAuth 2.0 Initiation
     */
    async initiateOAuth(service) {
        const config = this.configs[service];
        
        // Attempt to get user-provided Client ID from DB first
        const userClientId = await window.ApexDB.getSetting(`${service}_client_id`, config.clientId);
        
        if (!userClientId || userClientId.includes('YOUR_')) {
            const manualId = prompt(`Enter your ${service.toUpperCase()} Client ID to begin synchronization:`);
            if (!manualId) return;
            await window.ApexDB.setSetting(`${service}_client_id`, manualId);
            this.executeRedirect(service, manualId, config);
        } else {
            this.executeRedirect(service, userClientId, config);
        }
    },

    executeRedirect(service, clientId, config) {
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem(`${service}_oauth_state`, state);
        
        const redirectUri = window.location.origin + window.location.pathname;
        const responseType = service === 'google' ? 'token' : 'code';
        
        let url = `${config.authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&state=${state}`;
        if (config.scope) url += `&scope=${encodeURIComponent(config.scope)}`;
        
        window.location.href = url;
    },

    /**
     * Web Bluetooth Connection (Real-time HR)
     */
    async connectHeartRate() {
        try {
            console.log("[Integrations] Initializing Heart Rate Protocol...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['heart_rate'] }]
            });
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService('heart_rate');
            const characteristic = await service.getCharacteristic('heart_rate_measurement');
            
            characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
                const hr = event.target.value.getUint8(1);
                const hrEl = document.getElementById('live-hr');
                if (hrEl) {
                    hrEl.innerText = `${hr} BPM`;
                    hrEl.classList.add('animate-pulse');
                }
            });

            console.log(`[Integrations] Link Established: ${device.name}`);
            return true;
        } catch (e) {
            console.error("[Integrations] Bluetooth Failure", e);
            alert("Connection Failed: Ensure Bluetooth is active and device is discoverable.");
            return false;
        }
    },

    /**
     * REST API Fetchers (Called after token is captured in app.js)
     */
    async fetchGoogleCalendar(token) {
        try {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + new Date().toISOString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await res.json();
        } catch (e) {
            console.error("Google Cal Sync Failed", e);
            return null;
        }
    }
};

window.ApexIntegrations = ApexIntegrations;
