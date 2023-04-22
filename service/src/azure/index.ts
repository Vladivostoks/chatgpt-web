import sdk from 'microsoft-cognitiveservices-speech-sdk'
import { disconnect } from 'process';
import { WebSocket } from 'ws';

export function CreateSpeech2TextHandle(ws:WebSocket, language?:string):[sdk.SpeechRecognizer,sdk.PushAudioInputStream]
{
    console.log(`Azure Serve sst[${language}]:${process.env.AZURE_SPEECH_KEY}:${process.env.AZURE_SPEECH_REGION}`);

    // Create a speech config from the subscription key and region
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);
    const auto:boolean = !(typeof language === "string");
    let disconnect:number = 2;

    // Set Language
    if (!auto) {
        speechConfig.speechRecognitionLanguage = language;
    }
    else {
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, 'Continuous');
    }
    
    speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "100");
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "800");
    
    // TODO:Add Language
    const autoDetectSourceLanguageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(["en-US", "zh-CN"]);

    // Create a push stream from the audio file TODO:FIX Formate
    // const pushStream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormat(44100, 16, 2, sdk.AudioFormatTag.PCM));
    const pushStream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getDefaultInputFormat());

    // Create an audio config from the push stream
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    const recognizer = auto?new sdk.SpeechRecognizer(speechConfig, audioConfig)
                           :sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig);

    //返回实时和最终的结果
    recognizer.recognizing = (s: sdk.SpeechRecognizer, e: sdk.SpeechRecognitionEventArgs) => {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`;
        console.log(`[${timestamp}]RECOGNIZING: Text=${e.result.text}`);
        if(auto) {
            console.log(`RECOGNIZING: Language=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).language}`);
            console.log(`RECOGNIZING: LanguageConfidence=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).languageDetectionConfidence}`);
        }
        // ws.send(e.result.text);
    };

    recognizer.recognized = (s: sdk.SpeechRecognizer, e: sdk.SpeechRecognitionEventArgs) => {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`;

        console.log(`[${timestamp}]RECOGNIZED: Text=${e.result.text}`);
        if(auto) {
            console.log(`RECOGNIZED: Language=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).language}`);
            console.log(`RECOGNIZED: LanguageConfidence=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).languageDetectionConfidence}`);
        }
        //检测n个undefined之后就关闭识别并断开ws
        if(e.result.text) {
            ws.send(e.result.text);
            disconnect = 2;
        } else {
            disconnect-=1;
            ws.send(null);
            if(disconnect<0) {
                ws.close()
            }
        }
    };

    recognizer.canceled = (s, e) => {
        // @ts-ignore
        if (e.errorCode === sdk.CancellationErrorCode.ErrorAPIKey) {
          console.error('Invalid or incorrect subscription key');
        } else {
          console.debug(`Canceled: ${e.errorDetails}`);
        }
    };
  
    recognizer.sessionStopped = (s, e) => {
        console.log('Session stopped');
        recognizer.stopContinuousRecognitionAsync();
    };

    //建立连接后就开始持续识别，失败的话主动关闭连接
    recognizer.startContinuousRecognitionAsync(() => {
        console.log("Recognition started");
    }, (err) => {
        console.trace("err - " + err);
        console.log('WebSocket 连接已关闭。');
        ws.close();
        recognizer.close();
    });

    return [recognizer, pushStream];
}

/**
 * 文字转语音
 */
export function CreateText2SpeechHandle(ws:WebSocket, text:string):void
{
    console.log(`Azure Serve sst:${process.env.AZURE_SPEECH_KEY}:${process.env.AZURE_SPEECH_REGION}`);
    // Create a speech config from the subscription key and region
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);

    // Set the output format
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    // speechConfig.speechSynthesisLanguage = "en-GB"
    // speechConfig.speechSynthesisVoiceName = "en-GB-BellaNeural"; 

    const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    // speechSynthesizer.wordBoundary = function (sender: sdk.SpeechSynthesizer, event: sdk.SpeechSynthesisWordBoundaryEventArgs) {
    //     // Word, Punctuation, or Sentence
    //     var str = `WordBoundary event: \
    //         \r\n\tBoundaryType: ${event.boundaryType} \
    //         \r\n\tAudioOffset: ${(event.audioOffset + 5000) / 10000}ms \
    //         \r\n\tDuration: ${event.duration} \
    //         \r\n\tText: \"${event.text}\" \
    //         \r\n\tTextOffset: ${event.textOffset} \
    //         \r\n\tWordLength: ${event.wordLength}`;
    //     console.log(str);
    // };

    speechSynthesizer.synthesizing = function (s, e) {
        console.log(`Synthesizing event: \
            \r\n\tAudioData: ${e.result.audioData.byteLength} bytes`);
        // ws.send(e.result.audioData);
    };

    speechSynthesizer.speakTextAsync(
        text,
        result => {
            // Interact with the audio ArrayBuffer data
            const audioData = result.audioData;
            console.log(`Audio data byte size: ${audioData.byteLength}.`)
            speechSynthesizer.close();
            ws.send(audioData);
            ws.close();
        },
        error => {
            console.log(error);
            speechSynthesizer.close();
    });
}