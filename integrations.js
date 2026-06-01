/**
 * integrations.js - Apex Life V2 Integration Layer
 * Professional Protocol for Cloud Sync & Device Link
 */

const ApexIntegrations = {
    configs: {
        google: { 
            clientId: 'YOUR_GOOGLE_CLIENT_ID', 
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth'
        },
        polar: { 
            clientId: 'YOUR_POLAR_CLIENT_ID', 
            scope: 'accesslink.read_all',
            authUrl: 'https://flow.polar.com/oauth2/authorization'
        },
        garmin: {
            clientId: 'YOUR_GARMIN_CLIENT_ID',
            authUrl: 'https://connect.garmin.com/oauthConfirm'
        }
    },

    /**
     * Standardized OAuth 2.0 Discovery & Initiation
     */
    async initiateOAuth(service) {
        const config = this.configs[service];
        
        // 1. Check if user already provided a Client ID for this service
        const userClientId = await window.ApexDB.getSetting(`${service}_client_id`, '');
        
        if (!userClientId) {
            const manualId = prompt(`SYSTEM REQUIREMENT: Enter your ${service.toUpperCase()} Client ID to establish link. (Obtain this from the ${service.toUpperCase()} Developer Portal).`);
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
        
        // Open in a professional popup or direct redirect
        window.location.href = url;
    },

    /**
     * Web Bluetooth Protocol
     * Note: PWA cannot 'see' system-paired devices without explicit user re-selection
     */
    async connectHeartRate() {
        try {
            console.log("[Integrations] Initializing Heart Rate Discovery...");
            
            // Standard HR Service UUID
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['heart_rate'] }],
                optionalServices: ['battery_service', 'device_information']
            });

            const hrEl = document.getElementById('live-hr');
            if (hrEl) hrEl.innerText = "LINKING...";

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService('heart_rate');
            const characteristic = await service.getCharacteristic('heart_rate_measurement');
            
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
                const hr = event.target.value.getUint8(1);
                if (hrEl) {
                    hrEl.innerText = `${hr} BPM`;
                    hrEl.classList.add('animate-pulse');
                }
            });

            console.log(`[Integrations] Protocol Established: ${device.name}`);
            return true;
        } catch (e) {
            console.error("[Integrations] Discovery Failure", e);
            alert("DISCOVERY FAILURE: Ensure device is in pairing mode and not actively occupied by another application.");
            const hrEl = document.getElementById('live-hr');
            if (hrEl) hrEl.innerText = "";
            return false;
        }
    }
};

window.ApexIntegrations = ApexIntegrations;
