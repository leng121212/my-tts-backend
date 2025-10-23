const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// អនុញ្ញាតឲ្យ Frontend របស់អ្នក (ទោះនៅ Domain ណាក៏ដោយ) អាចហៅមកបាន
app.use(cors()); 

// អនុញ្ញាតឲ្យ Server អាចអានទិន្នន័យជា JSON ពី Frontend
app.use(express.json());

// អាន Key និង Region ពី Environment Variables (ដែល Render នឹងផ្តល់ឲ្យ)
const MY_AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const MY_AZURE_REGION = process.env.AZURE_SPEECH_REGION;

// បង្កើត Endpoint សម្រាប់ឲ្យ Frontend ហៅមក
app.post('/api/generate-speech', async (req, res) => {

    // ពិនិត្យមើលថា តើ Key មានឬអត់
    if (!MY_AZURE_KEY || !MY_AZURE_REGION) {
        console.error("Azure Key ឬ Region មិនត្រូវបានកំណត់ (set) ទេ");
        return res.status(500).send("Server configuration error");
    }

    // Inside app.post('/api/generate-speech', ...) endpoint of my-tts-backend/server.js

// ... (Get ssml_from_user and userApiKey) ...

try {
    // --- START: Validate API Key via api-key-manager backend ---
    // !!! ប្តូរ URL នេះ ទៅជា URL ពិតប្រាកដរបស់ api-key-manager របស់អ្នក !!!
    const apiKeyManagerUrl = 'https://api-key-manager.onrender.com/api/validate-key'; 

    // TODO: អ្នកត្រូវគណនាចំនួនតួអក្សរដែលត្រូវការឲ្យបានត្រឹមត្រូវ
    //       (អាចយក Logic ពី handleInput() ក្នុង Combind.html មកប្រើ)
    //       ឧទាហរណ៍៖ រាប់តួអក្សរក្នុង SSML ដោយមិនរាប់ Tags? 
    const charactersNeeded = ssml_from_user.length; // ឧទាហរណ៍សាមញ្ញ (ត្រូវកែ)

    const validationResponse = await fetch(apiKeyManagerUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         // TODO: Add secret key for backend-to-backend auth if implemented
         body: JSON.stringify({ apiKey: userApiKey, charactersNeeded: charactersNeeded })
    });

    const validationResult = await validationResponse.json();

    if (!validationResponse.ok || !validationResult.isValid) {
         // ប្រើ Status Code ពី Backend ថ្មី ឬ Default ទៅ 401/403
         const statusCode = validationResponse.status === 200 ? 403 : validationResponse.status; 
         console.warn(`API Key validation failed for ${userApiKey}: ${validationResult.reason}`); // Log the reason
         return res.status(statusCode).send(validationResult.reason || 'API Key validation failed.');
    }
    // --- END: Validate API Key ---

    // --- បន្តហៅទៅ Azure (ប្រសិនបើ Key ត្រឹមត្រូវ) ---
    console.log(`API Key ${userApiKey} validated successfully. Proceeding with Azure call.`);
    const azureEndpoint = `https://${MY_AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await axios.post(azureEndpoint, ssml_from_user, { 
        headers: {
            'Ocp-Apim-Subscription-Key': MY_AZURE_KEY, 
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
        },
        responseType: 'arraybuffer' 
    });

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.data);

} catch (error) {
    console.error("Error in /api/generate-speech:", error.message);
    // Avoid sending detailed internal errors to the client unless it's a validation error caught earlier
    if (res.headersSent) { // Check if headers already sent (e.g., from validation fail)
        return;
    }
    if (error.response && error.response.data) { // Axios error from Azure
         console.error("Azure Error Data:", error.response.data.toString());
         res.status(500).send("Error contacting speech service.");
    } else if (error.message.includes("fetch failed") || error.code === 'ECONNREFUSED') { // Network error calling validation
        res.status(500).send("Could not reach API key validation service.");
    }
    else { // Other errors
        res.status(500).send("Internal server error.");
    }
}
        const ssml_from_user = req.body.ssml_data; 

        if (!ssml_from_user) {
             return res.status(400).send("No SSML data provided");
        }

        const azureEndpoint = `https://${MY_AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

        // Backend ប្រើ Key សម្ងាត់ ដើម្បីហៅទៅ Azure
        const response = await axios.post(azureEndpoint, ssml_from_user, {
            headers: {
                'Ocp-Apim-Subscription-Key': MY_AZURE_KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
            },
            responseType: 'arraybuffer' // សុំទិន្នន័យជាសំឡេង
        });

        // បញ្ជូនសំឡេងដែលបានពី Azure ត្រឡប់ទៅឲ្យ Frontend វិញ
        res.set('Content-Type', 'audio/mpeg');
        res.send(response.data);

    } catch (error) {
        // បង្ហាញ Error ឲ្យបានច្បាស់នៅក្នុង Log របស់ Server
        console.error("Error calling Azure:", error.response ? error.response.data.toString() : error.message);
        res.status(500).send("Error generating speech");
    }
});

// ដំណើរការ Server
const PORT = process.env.PORT || 10000; // Render នឹងផ្តល់ PORT នេះដោយស្វ័យប្រវត្តិ
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});