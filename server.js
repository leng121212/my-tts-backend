const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors()); 
app.use(express.json());

// Endpoint សម្រាប់ Frontend (Combind.html) ហៅមក
app.post('/api/generate-speech', async (req, res) => {
    console.log("Received request for /api/generate-speech"); // Log 1: Request received
    
    // យក ssml_data និង apiKey ពី request body
    const { ssml_data, apiKey: userApiKey } = req.body; 

    // ពិនិត្យមើលថា តើ ssml_data និង userApiKey មានតម្លៃឬអត់
    if (!ssml_data || !userApiKey) {
        console.warn("Missing ssml_data or apiKey in request body");
        return res.status(400).send("Missing ssml_data or apiKey in the request.");
    }

    // អាន Azure Key និង Region ពី Environment Variables (របស់ my-tts-backend)
    const MY_AZURE_KEY = process.env.AZURE_SPEECH_KEY;
    const MY_AZURE_REGION = process.env.AZURE_SPEECH_REGION;

    // ពិនិត្យមើលថា តើ Azure Key/Region មានកំណត់ក្នុង Environment Variables ឬអត់
    if (!MY_AZURE_KEY || !MY_AZURE_REGION) {
        console.error("!!! CRITICAL: Azure Speech Key or Region is not set in environment variables for my-tts-backend.");
        return res.status(500).send("Server configuration error: Azure credentials missing.");
    }
    console.log("Azure Key/Region loaded from environment."); // Log 2: Azure keys loaded

    try {
        console.log("Entering try block for API key validation and Azure call."); // Log 3: Entering try block
        
        // --- START: Validate User API Key via api-key-manager backend ---
        // !!! សូមប្រាកដថា URL នេះ គឺជា URL ពិតប្រាកដរបស់ api-key-manager service របស់អ្នក !!!
        const apiKeyManagerUrl = 'https://api-key-manager.onrender.com/api/validate-key'; 
        
        // TODO: កែលម្អ Logic គណនាចំនួនតួអក្សរឲ្យបានត្រឹមត្រូវជាងនេះ
        //       (ឧ. រាប់តែ Text content ដោយមិនរាប់ SSML tags)
        const charactersNeeded = ssml_data.length; // គ្រាន់តែជាការប៉ាន់ស្មានសាមញ្ញ
        console.log(`Validating User API Key ${userApiKey} for estimated ${charactersNeeded} characters...`); // Log 4: Calling validation

        const validationResponse = await fetch(apiKeyManagerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // TODO: បន្ថែម Secret Key សម្រាប់ Backend-to-Backend Authentication (ប្រសិនបើចាំបាច់)
            body: JSON.stringify({ apiKey: userApiKey, charactersNeeded: charactersNeeded })
        });
        console.log(`Validation service response status: ${validationResponse.status}`); // Log 5: Validation response status

        // ពិនិត្យមើល Response ពី Validation Service
        let validationResult;
        try {
            validationResult = await validationResponse.json();
        } catch (jsonError) {
             console.error("Error parsing JSON response from validation service:", jsonError);
             // ព្យាយាមអាន Response ជា Text ដើម្បីមើល Error Message ពី Backend
             const errorText = await validationResponse.text().catch(() => "Could not read response text.");
             console.error("Validation service response text:", errorText);
             return res.status(500).send(`Invalid response from validation service: ${errorText.substring(0, 100)}`); // Show part of the error
        }


        if (!validationResponse.ok || !validationResult.isValid) {
            const statusCode = validationResponse.status === 200 ? 403 : validationResponse.status; // If status is 200 but not valid -> Forbidden
            const reason = validationResult.reason || validationResult.error || 'API Key validation failed.';
            console.warn(`API Key validation failed for ${userApiKey}: ${reason}`); // Log 6: Validation failed
            return res.status(statusCode).send(reason);
        }
        // --- END: Validate User API Key ---

        // --- បន្តហៅទៅ Azure Speech Service (ប្រសិនបើ User API Key ត្រឹមត្រូវ) ---
        console.log(`User API Key ${userApiKey} validated successfully. Proceeding with Azure call.`); // Log 7: Validation successful
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
        console.log(`Azure call successful. Response status: ${azureResponse.status}`); // Log 8: Azure call successful
        
        // បញ្ជូនไฟล์សំឡេង (MP3) ត្រឡប់ទៅ Frontend វិញ
        res.set('Content-Type', 'audio/mpeg');
        res.send(azureResponse.data);
        console.log("Audio data sent back to client."); // Log 9: Response sent

    } catch (error) { // This catch block handles errors from validation call or Azure call
        console.error("!!! ERROR within /api/generate-speech try block:", error); // Log 10: Error occurred
        
        // Check if response headers have already been sent (e.g., by validation failure return)
        if (res.headersSent) { 
            console.error("Headers already sent, cannot send further error response.");
            return; 
        }

        // Provide more specific error messages based on the error type
        if (error.response && error.response.data) { // Axios error (likely from Azure)
             console.error("Azure Error Status:", error.response.status);
             console.error("Azure Error Data:", error.response.data.toString());
             res.status(500).send("Error contacting the external speech synthesis service.");
        } else if (error.message.includes("fetch") || error.code === 'ECONNREFUSED' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') { // Network error calling validation service
             console.error("Network error calling validation service:", error.message);
            res.status(500).send("Service temporarily unavailable (cannot reach validation). Please try again later.");
        } else if (error instanceof SyntaxError && error.message.includes("JSON")) { // JSON parsing error from validation response
            console.error("Error parsing validation response JSON:", error);
            res.status(500).send("Received an invalid response from the validation service.");
        }
        else { // Other generic errors
            console.error("Generic server error:", error.message);
            res.status(500).send("An internal server error occurred during speech generation.");
        }
    } // End of catch block
}); // End of app.post('/api/generate-speech')

// ដំណើរការ Server
const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => {
    console.log(`my-tts-backend server is running on port ${PORT}`);
});

```

**ជំហានបន្ទាប់៖**

1.  **Update Code:** ចម្លង (Copy) កូដ `server.js` ថ្មីនេះ ទៅជំនួសកូដចាស់ នៅក្នុង Project `my-tts-backend` របស់អ្នក។
2.  **Save:** រក្សាទុកไฟล์។
3.  **Push to GitHub:** បញ្ជូន (Push) ការផ្លាស់ប្តូរនេះ ទៅកាន់ GitHub Repository របស់ `my-tts-backend`។
    ```bash
    git add server.js
    git commit -m "Fix syntax error in generate-speech endpoint and add logging"
    git push origin main
    
