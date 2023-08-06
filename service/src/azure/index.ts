import sdk from 'microsoft-cognitiveservices-speech-sdk'
import { disconnect } from 'process';
import { WebSocket } from 'ws';
import _ from 'lodash';

/**
 * 语音转文字
 */ 
export function CreateSpeech2TextHandle(ws:WebSocket, language:string[]):[sdk.SpeechRecognizer,sdk.PushAudioInputStream]
{
    console.log(`Azure Serve sst[${language}]:${process.env.AZURE_SPEECH_KEY}:${process.env.AZURE_SPEECH_REGION}`);

    // Create a speech config from the subscription key and region
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);
    let disconnect:number = 2;
    // Set Language
    let autoDetectSourceLanguageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(language);
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, 'Continuous');
    
    speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "100");
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "800");
    speechConfig.setProperty(sdk.PropertyId.Conversation_Initial_Silence_Timeout, "800");
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);
    
    // TODO:Add Language

    // Create a push stream from the audio file TODO:FIX Formate
    // const pushStream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormat(44100, 16, 2, sdk.AudioFormatTag.PCM));
    const pushStream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getDefaultInputFormat());

    // Create an audio config from the push stream
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig);

    //返回实时和最终的结果
    recognizer.recognizing = (s: sdk.SpeechRecognizer, e: sdk.SpeechRecognitionEventArgs) => {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`;
        console.log(`[${timestamp}]RECOGNIZING: Text=${e.result.text}`);
        console.log(`RECOGNIZING: Language=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).language}`);
        console.log(`RECOGNIZING: LanguageConfidence=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).languageDetectionConfidence}`);
        // ws.send(e.result.text);
    };

    recognizer.recognized = (s: sdk.SpeechRecognizer, e: sdk.SpeechRecognitionEventArgs) => {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`;

        console.log(`[${timestamp}]RECOGNIZED: Text=${e.result.text}`);
        console.log(`RECOGNIZED: Language=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).language}`);
        console.log(`RECOGNIZED: LanguageConfidence=${sdk.AutoDetectSourceLanguageResult.fromResult(e.result).languageDetectionConfidence}`);

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
          console.debug(`Canceled: ${e.errorDetails} VIA ${e.reason}`);
          console.log('服务异常 WebSocket 连接已关闭。');
          ws.send("{errno:1}");
          ws.close();
          recognizer.close();
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
 * 发音评估
 */
export function CreatePronunciationAssessment(ws:WebSocket, reference_text:string, language:string):[sdk.SpeechRecognizer,sdk.PushAudioInputStream]
{
    console.log(`Azure Serve sst[${language}]:${process.env.AZURE_SPEECH_KEY}:${process.env.AZURE_SPEECH_REGION}`);

    // Create a speech config from the subscription key and region
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);

    // Set Language
    speechConfig.speechRecognitionLanguage = language;
    
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);
    speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1500");
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1600");

    // Create a push stream from the audio file TODO:FIX Formate
    // const pushStream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormat(44100, 16, 2, sdk.AudioFormatTag.PCM));
    const pushStream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getDefaultInputFormat());

    // Create an audio config from the push stream
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
                           
    // create pronunciation assessment config, set grading system, granularity and if enable miscue based on your requirement.
    const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
        reference_text,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Word,
        true
    );
    pronunciationAssessmentConfig.phonemeAlphabet = "IPA";
    pronunciationAssessmentConfig.applyTo(recognizer);

    //返回最终的结果
    function onRecognizedResult(result) {
        console.log("pronunciation assessment for: ", result.text);
        var pronunciation_result = sdk.PronunciationAssessmentResult.fromResult(result);
        console.dir(pronunciation_result);
        console.log(" Accuracy score: ", pronunciation_result.accuracyScore, '\n',
            "pronunciation score: ", pronunciation_result.pronunciationScore, '\n',
            "completeness score : ", pronunciation_result.completenessScore, '\n',
            "fluency score: ", pronunciation_result.fluencyScore
        );
        console.log("  Word-level details:");
        _.forEach(pronunciation_result.detailResult.Words, (word, idx) => {
            console.log("    ", idx + 1, ": word: ", word.Word, 
                        "\taccuracy score: ", word.PronunciationAssessment.AccuracyScore, 
                        "\terror type: ", word.PronunciationAssessment.ErrorType, ";");
        });
        recognizer.close();
    }

    recognizer.recognized = (s: sdk.SpeechRecognizer, e: sdk.SpeechRecognitionEventArgs) => {
        // onRecognizedResult(e.result);

        var pronunciationAssessmentResultJson = e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);

        console.dir(JSON.stringify(pronunciationAssessmentResultJson));
        if(e.result.text)
        {
            ws.send(pronunciationAssessmentResultJson);
            ws.close();
        }
    };

    recognizer.canceled = (s, e) => {
        // @ts-ignore
        if (e.errorCode === sdk.CancellationErrorCode.ErrorAPIKey) {
          console.error('Invalid or incorrect subscription key');
        } else {
          console.debug(`Canceled: ${e.errorDetails}`);
        }
        ws.close();
    };
  
    recognizer.sessionStopped = (s, e) => {
        console.log('Session stopped');
        recognizer.stopContinuousRecognitionAsync();
        ws.close();
    };

    //建立连接后就开始持续识别，失败的话主动关闭连接
    recognizer.startContinuousRecognitionAsync(() => {
        console.log("Assessment started");
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

    // speechSynthesizer.synthesizing = function (s, e) {
    //     console.log(`Synthesizing event: \
    //         \r\n\tAudioData: ${e.result.audioData.byteLength} bytes`);
    //     // ws.send(e.result.audioData);
    // };

    speechSynthesizer.speakTextAsync(
        text,
        result => {
            // Interact with the audio ArrayBuffer data
            const audioData = result.audioData;
            console.log(`Audio data byte size: ${audioData.byteLength}.`)
            speechSynthesizer.close();
            ws.send(audioData);
            ws.send(null);
            ws.close();
        },
        error => {
            console.log(error);
            speechSynthesizer.close();
    });
}

export async function CreateText2SpeechHandleEx(ws:WebSocket, text:string):Promise<boolean>
{
    console.log(`Azure Serve sst:${process.env.AZURE_SPEECH_KEY}:${process.env.AZURE_SPEECH_REGION}`);
    // Create a speech config from the subscription key and region
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);

    // Set the output format
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    // speechConfig.speechSynthesisLanguage = "en-GB"
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);

    // speechConfig.speechSynthesisVoiceName = "en-GB-BellaNeural"; 

    const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    return new Promise<boolean>(resolve => {
        speechSynthesizer.speakTextAsync(
            text,
            result => {
                // Interact with the audio ArrayBuffer data
                const audioData = result.audioData;
                console.log(`Audio data byte size: ${audioData.byteLength}.`)
                speechSynthesizer.close();
                ws.send(audioData);
                ws.send(null);
                resolve(true);
                // ws.close();
            },
            error => {
                console.log(error);
                speechSynthesizer.close();
                ws.close();
                resolve(false);
        });
    });
}