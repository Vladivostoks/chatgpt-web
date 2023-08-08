import express from 'express'
import expressWs from 'express-ws';
import WebSocket from 'ws';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStaticPath from 'ffmpeg-static';
import Stream from 'stream';
import EventEmitter from 'events';
import type { RequestProps } from './types'
import type { ChatMessage } from './chatgpt'
import { chatConfig, chatReplyProcess, currentModel } from './chatgpt'
import { auth } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'
import sdk from 'microsoft-cognitiveservices-speech-sdk'
import { CreatePronunciationAssessment, CreateSpeech2TextHandle, CreateText2SpeechHandle } from './azure'
import { Writable } from 'stream';

const wsInstance = expressWs(express());
const { app } = wsInstance;

const router = express.Router()
const eventEmitter = new EventEmitter();

app.use(express.static('public'))
app.use(express.json())

app.all('*', (_, res, next) => {
  //res.header('Access-Control-Allow-Origin', '*')
  //res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  //res.header('Access-Control-Allow-Methods', '*')
  next()
})

router.post('/chat-process', [auth, limiter], async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')

  try {
    const { prompt, options = {}, systemMessage, temperature, top_p } = req.body as RequestProps
    let firstChunk = true
    await chatReplyProcess({
      message: prompt,
      lastContext: options,
      process: (chat: ChatMessage) => {
        res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`)
        // console.dir(`session[${options.conversationId}] send`);
        eventEmitter.emit(options.conversationId, chat);
        firstChunk = false
      },
      systemMessage,
      temperature,
      top_p,
    })
  }
  catch (error) {
    res.write(JSON.stringify(error))
  }
  finally {
    res.end()
  }
})

router.post('/config', auth, async (req, res) => {
  try {
    const response = await chatConfig()
    res.send(response)
  }
  catch (error) {
    res.send(error)
  }
})

router.post('/session', async (req, res) => {
  try {
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY
    const hasAuth = isNotEmptyString(AUTH_SECRET_KEY)
    res.send({ status: 'Success', message: '', data: { auth: hasAuth, model: currentModel() } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')

    if (process.env.AUTH_SECRET_KEY !== token)
      throw new Error('密钥无效 | Secret key is invalid')

    res.send({ status: 'Success', message: 'Verify successfully', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

// 语音转文字
app.ws('/azure/stt', (ws: WebSocket, req) => {
  console.log(`sst链接建立`);
  let language:string[] = [];

  //前端传入识别语言类型
  if(typeof req.query?.lang === "string") {
    language = [req.query?.lang];
  }
  else {
    language = req.query?.lang as Array<string>;
  }
  language = language ?? ["en-US"];
  console.log("reference lang:"+language);
  const [recognizer,translate_stream] = CreateSpeech2TextHandle(ws, language);
  // const [recognizer,translate_stream] = CreateSpeech2TextHandle(ws, ["en-US", "zh-CN"]);

  // 将音频流从WebM格式转换为PCM格式
  // Step1: 定义输入流
  const stream_input = new Stream.Readable({
    read(size) {
      // console.log(`read ${size}`);
    }
  });
  stream_input.on('end', () => {
    console.log('Finished reading');
  });
  const command:ffmpeg.FfmpegCommand = ffmpeg().setFfmpegPath(ffmpegStaticPath)
                                               .input(stream_input)
                                               .outputOptions(['-f s16le', '-ar 16000', '-ac 1'])
                                               .audioCodec('pcm_s16le')
                                               .format('s16le')
  const stream_out:Stream.Writable = command.pipe()

  command.on('error', (err) => {
    console.error(err);
  });

  ws.binaryType = 'arraybuffer';
  ws.on("open", () => {
    console.log(`sst链接建立2`);
    // TODO初始化语音识别参数
  });
  
  ws.on('message', (data:ArrayBuffer) => {
    // console.log(`input from websocket ${data.byteLength}`);
    stream_input.push(Buffer.from(data));
  });

  stream_out.on('data', (data: Buffer) => {
    // console.log(`output from ffmpeg ${data.byteLength}`);
    translate_stream.write(data.buffer);
  });

  //对端关闭的时候，停止识别
  ws.on('close', () => {
    console.log('sst 连接已关闭。');
    command.kill('SIGKILL');
    stream_input.destroy();
    stream_out.destroy();
    translate_stream.close();
    recognizer.stopContinuousRecognitionAsync();
  });
});

// 文字转语音
app.ws('/azure/tts/:uuid', (ws: WebSocket, req:express.Request) => {
  console.log(`tts链接建立 uuid: ${req.params.uuid}`);

  //监听AI回复并转换成语音
  eventEmitter.on(req.params.uuid, (data:ChatMessage) => {
    // console.dir(`session[${req.params.uuid}] get`);
    if(data.detail.choices[0].finish_reason=="stop") {
      console.dir(JSON.stringify(data))
      CreateText2SpeechHandle(ws, data.text, req.query?.language as string, req.query?.voice as string);
    }
  });

  ws.on('close', () => {
    console.log(`tts链接销毁 uuid: ${req.originalUrl}`);
    eventEmitter.removeAllListeners(req.params.uuid);
  });
});

// 发音评估
app.ws('/azure/pronunciation_assessment', (ws: WebSocket, req:express.Request) => {
  console.log(`发音评估链接建立`);

  console.log("reference text:"+decodeURIComponent(Buffer.from(req.query?.reftext as string,'base64').toString()));
  console.log("reference lang:"+req.query?.lang);

  //赋值reference_text和language
  const reference_text:string = decodeURIComponent(Buffer.from(req.query?.reftext as string,'base64').toString());
  let language = req.query?.lang as string ?? "en-US";
  const [recognizer,translate_stream] = CreatePronunciationAssessment(ws, reference_text, language);

  // 将音频流从WebM格式转换为PCM格式
  // Step1: 定义输入流
  const stream_input = new Stream.Readable({ read(size) {} });
  const command:ffmpeg.FfmpegCommand = ffmpeg().setFfmpegPath(ffmpegStaticPath)
                                               .input(stream_input)
                                               .outputOptions(['-f s16le', '-ar 16000', '-ac 1'])
                                               .audioCodec('pcm_s16le')
                                               .format('s16le')
  const stream_out:Stream.Writable = command.pipe()

  stream_out.on('data', (data: Buffer) => {
    // console.log(`output from ffmpeg ${data.byteLength}`);
    translate_stream.write(data.buffer);
  });

  stream_out.on('end', () => {
    translate_stream.close();
    recognizer.stopContinuousRecognitionAsync();
  });

  command.on('error', (err) => {
    console.error(err);
  });

  ws.binaryType = 'arraybuffer';
  ws.on('message', (data:ArrayBuffer) => {
    if(data.byteLength > 0) 
    {
      stream_input.push(Buffer.from(data));
    }
    else
    {
      recognizer.stopContinuousRecognitionAsync();
    }
  });

  //对端关闭的时候，停止识别
  ws.on('close', () => {
    console.log('发音评估链接已关闭。');
    command.kill('SIGKILL');
    stream_input.destroy();
    stream_out.destroy();
  });
});

app.use('', router)
app.use('/api', router)

app.set('trust proxy', 1)

app.listen(8080, 'localhost', () => globalThis.console.log('Server is running on port localhost:8080'))
// app.listen(8081, 'localhost', () => globalThis.console.log('Server is running on port localhost:8081'))
