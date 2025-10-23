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

    try {
        // យក SSML ដែល Frontend (Combind.html) បញ្ជូនមក
        // យើងនឹងសន្មតថា Frontend បញ្ជូន object { "ssml_data": "..." }
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