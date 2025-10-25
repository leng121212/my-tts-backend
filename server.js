const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors()); 
app.use(express.json());

// កំណត់ Secret Key ផ្ទៃក្នុង៖ ត្រូវកំណត់តម្លៃនេះនៅក្នុង Environment Variables របស់ Render/Host របស់អ្នក!
// Frontend ផ្ញើ Secret Key នេះមកជាមួយ Header 'x-internal-secret'
const INTERNAL_TOOL_SECRET = process.env.INTERNAL_TOOL_SECRET || 'TRABEKPREY_BYPASS_SECRET_2025'; 

// Endpoint សម្រាប់ Frontend (Combind.html) ហៅមក
app.post('/api/generate-speech', async (req, res) => {
    console.log("Received request for /api/generate-speech"); // Log 1: Request received
    
    // យក ssml_data និង apiKey ពី request body
    const { ssml_data, apiKey: userApiKey } = req.body; 
    
    // យក Internal Secret ពី Request Header (Frontend ផ្ញើមក)
    const internalSecret = req.headers['x-internal-secret']; 

    // ពិនិត្យមើលថា តើ ssml_data មានតម្លៃឬអត់
    if (!ssml_data) {
        console.warn("Missing ssml_data in request body");
        return res.status(400).send("Missing ssml_data in the request.");
    }
    
    // --- START: Internal Tool Bypass Check ---
    let bypassValidation = false;
    if (internalSecret === INTERNAL_TOOL_SECRET) {
        console.log("Internal tool secret matched. Bypassing API key validation.");
        bypassValidation = true;
    } else if (!userApiKey || userApiKey === '') {
        // ប្រសិនបើមិនមែនជា Internal Tool ហើយ User Key មិនមាន (ឬទទេ), ចាត់ទុកថា Error 400
        console.warn("Missing userApiKey for non-internal request.");
        return res.status(400).send("Missing apiKey in the request.");
    }
    // --- END: Internal Tool Bypass Check ---


    // អាន Azure Key និង Region ពី Environment Variables (របស់ my-tts-backend)
    const MY_AZURE_KEY = process.env.AZURE_SPEECH_KEY;
    const MY_AZURE_REGION = process.env.AZURE_SPEECH_REGION;

    // ពិនិត្យមើលថា តើ Azure Key/Region មានកំណត់ក្នុង Environment Variables ឬអត់
    if (!MY_AZURE_KEY || !MY_AZURE_REGION) {
        console.error("!!! CRITICAL: Azure Speech Key or Region is not set in environment variables for my-tts-backend.");
        return res.status(500).send("Server configuration error: Azure credentials missing.");
    }
    console.log("Azure Key/Region loaded from environment."); 

    try {
        console.log("Entering try block for API key validation/bypass and Azure call."); 
        
        if (!bypassValidation) {
            // --- START: Validate User API Key (សម្រាប់ User ខាងក្រៅ) ---
            const apiKeyManagerUrl = 'https://api-key-manager.onrender.com/api/validate-key'; 
            const charactersNeeded = ssml_data.length; // គ្រាន់តែជាការប៉ាន់ស្មានសាមញ្ញ
            console.log(`Validating User API Key ${userApiKey} for estimated ${charactersNeeded} characters...`);

            const validationResponse = await fetch(apiKeyManagerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: userApiKey, charactersNeeded: charactersNeeded })
            });
            console.log(`Validation service response status: ${validationResponse.status}`);

            let validationResult;
            try {
                validationResult = await validationResponse.json();
            } catch (jsonError) {
                 const errorText = await validationResponse.text().catch(() => "Could not read response text.");
                 console.error("Error parsing JSON/Response text:", errorText);
                 return res.status(500).send(`Invalid response from validation service: ${errorText.substring(0, 100)}`); 
            }

            if (!validationResponse.ok || !validationResult.isValid) {
                const statusCode = validationResponse.status === 200 ? 403 : validationResponse.status; 
                const reason = validationResult.reason || validationResult.error || 'API Key validation failed.';
                console.warn(`API Key validation failed for ${userApiKey}: ${reason}`); 
                return res.status(statusCode).send(reason);
            }
            console.log(`User API Key ${userApiKey} validated successfully. Proceeding with Azure call.`);
            // --- END: Validate User API Key ---
        } else {
             console.log("Validation bypassed by internal secret. Proceeding with Azure call.");
        }

        // --- បន្តហៅទៅ Azure Speech Service ---
        const azureEndpoint = `https://${MY_AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        
        // ប្រើ axios ដើម្បីហៅទៅ Azure
        const azureResponse = await axios.post(azureEndpoint, ssml_data, { 
            headers: {
                'Ocp-Apim-Subscription-Key': MY_AZURE_KEY, // ប្រើ Azure Key របស់ Admin
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' // ស្នើសុំជា MP3
            },
            responseType: 'arraybuffer' // ស្នើសុំ Response ជា binary data (audio)
        });
        console.log(`Azure call successful. Response status: ${azureResponse.status}`);
        
        // បញ្ជូនไฟล์សំឡេង (MP3) ត្រឡប់ទៅ Frontend វិញ
        res.set('Content-Type', 'audio/mpeg');
        res.send(azureResponse.data);
        console.log("Audio data sent back to client."); 

    } catch (error) { // This catch block handles errors from validation call or Azure call
        console.error("!!! ERROR within /api/generate-speech try block:", error); 
        
        if (res.headersSent) { 
            console.error("Headers already sent, cannot send further error response.");
            return; 
        }

        if (error.response && error.response.data) { 
             console.error("Azure Error Status:", error.response.status);
             console.error("Azure Error Data:", error.response.data.toString());
             res.status(500).send("Error contacting the external speech synthesis service.");
        } else if (error.message.includes("fetch") || error.code === 'ECONNREFUSED' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') { 
             console.error("Network error calling validation service:", error.message);
            res.status(500).send("Service temporarily unavailable (cannot reach validation). Please try again later.");
        } else { 
            console.error("Generic server error:", error.message);
            res.status(500).send("An internal server error occurred during speech generation.");
        }
    } 
}); 

// ដំណើរការ Server
const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => {
    console.log(`my-tts-backend server is running on port ${PORT}`);
});
