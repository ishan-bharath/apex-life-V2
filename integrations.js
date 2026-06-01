/**
 * integrations.js - Apex Life V2 Integration Layer
 * OAuth PKCE Flow & Device Communications
 */

const ApexIntegrations = {
    configs: {
        strava: { clientId: '', redirectUri: window.location.origin },
        garmin: { clientId: '', redirectUri: window.location.origin },
        polar: { clientId: '', redirectUri: window.location.origin },
        coros: { clientId: '', redirectUri: window.location.origin },
        whoop: { clientId: '', redirectUri: window.location.origin },
        google: { clientId: '', redirectUri: window.location.origin }
    },

    async initiateOAuth(service) {
        const config = this.configs[service];
        if (!config || !config.clientId) {
            console.error(`[Integrations] Client ID for ${service} not configured.`);
            alert(`CLIENT ID REQUIRED: Please set the ${service.toUpperCase()} Client ID in integrations.js to enable sync.`);
            return;
        }

        const state = Math.random().toString(36).substring(7);
        localStorage.setItem(`${service}_oauth_state`, state);

        let authUrl = "";
        switch(service) {
            case 'google':
                authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.clientId}&redirect_uri=${config.redirectUri}&response_type=token&scope=https://www.googleapis.com/auth/calendar.readonly&state=${state}`;
                break;
            case 'strava':
                authUrl = `https://www.strava.com/oauth/authorize?client_id=${config.clientId}&redirect_uri=${config.redirectUri}&response_type=code&scope=activity:read_all&state=${state}`;
                break;
            case 'polar':
                // Polar Flow Accesslink OAuth2
                authUrl = `https://flow.polar.com/oauth2/authorization?client_id=${config.clientId}&response_type=code&scope=accesslink.read_all&state=${state}`;
                break;
            case 'garmin':
                // Garmin usually requires a backend for OAuth 1.0a or specific Connect API keys
                alert("GARMIN SYNC: Requires a production API key. Follow the instructions in docs/GARMIN.md to enable.");
                return;
            default:
                alert(`SYNC PROTOCOL: ${service.toUpperCase()} integration stub active. No backend detected.`);
                return;
        }

        if (authUrl) window.location.href = authUrl;
    },

    async connectHeartRate() {
        try {
            console.log("[Integrations] Requesting Heart Rate Device...");
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
                if (hrEl) hrEl.innerText = `${hr} BPM`;
            });

            console.log(`[Integrations] Connected to ${device.name}`);
            return true;
        } catch (e) {
            console.error("[Integrations] Bluetooth Error", e);
            return false;
        }
    }
};

window.ApexIntegrations = ApexIntegrations;
