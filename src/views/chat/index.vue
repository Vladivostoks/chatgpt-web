<script setup lang='ts'>
import { Ref, watch } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { NAutoComplete, NButton, NInput, NProgress, useDialog, useMessage } from 'naive-ui'
import html2canvas from 'html2canvas'
import { Message } from './components'
import { useScroll } from './hooks/useScroll'
import { useChat } from './hooks/useChat'
import { useCopyCode } from './hooks/useCopyCode'
import { useUsingContext } from './hooks/useUsingContext'
import HeaderComponent from './components/Header/index.vue'
import { HoverButton, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useChatStore, usePromptStore } from '@/store'
import { fetchChatAPIProcess } from '@/api'
import { t } from '@/locales'

let controller = new AbortController()

const openLongReply = import.meta.env.VITE_GLOB_OPEN_LONG_REPLY === 'true'

const route = useRoute()
const dialog = useDialog()
const ms = useMessage()

const chatStore = useChatStore()

useCopyCode()

const { isMobile } = useBasicLayout()
const { addChat, updateChat, updateChatSome, getChatByUuidAndIndex } = useChat()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom } = useScroll()
const { usingContext, toggleUsingContext } = useUsingContext()

const { uuid } = route.params as { uuid: string }

const dataSources = computed(() => chatStore.getChatByUuid(+uuid))
const conversationList = computed(() => dataSources.value.filter(item => (!item.inversion && !!item.conversationOptions)))

const prompt = ref<string>('')
const loading = ref<boolean>(false)
const inputRef = ref<Ref | null>(null)

// 添加PromptStore
const promptStore = usePromptStore()

// 使用storeToRefs，保证store修改后，联想部分能够重新渲染
const { promptList: promptTemplate } = storeToRefs<any>(promptStore)

// 未知原因刷新页面，loading 状态不会重置，手动重置
dataSources.value.forEach((item, index) => {
  if (item.loading)
    updateChatSome(+uuid, index, { loading: false })
})


let ws_addr = import.meta.env.VITE_AZURE_API_BASE_URL;
let ws_socket:WebSocket;
let recorder:MediaRecorder;
const silenceLimit:number = 0.5
const autoTalk:boolean = true;

//开启录音监听
function startRecording() {
  let audioChunks:Blob[] = []
  //先建立连接然后开始录音
  // 创建一个websocket客户端，传入一个websocket服务器的URL
  ws_socket = new WebSocket(ws_addr);
      
  // 监听open事件，表示连接已建立，初始化音频
  ws_socket.addEventListener("open", () => {
    // 获取音频流
    // console.dir(navigator.mediaDevices.enumerateDevices());
    navigator.mediaDevices.getUserMedia({ audio:true }).then((stream:MediaStream) => {
      // let track:MediaStreamTrack = stream.getAudioTracks()[0];
      // track.applyConstraints({
      //   sampleRate: 44100, // 采样率
      //   channelCount: 2, // 声道数
      //   sampleSize: 16 // 位深度
      // }) 

      //音频分析
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      const mstimeInterval = 100;

      source.connect(analyser);
      console.dir(audioCtx.destination);
      analyser.fftSize = 256;

      recorder = new MediaRecorder(stream,{
        mimeType: "audio/webm",
      });
      
      //获取人声音量
      function getAverageVolume() {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        analyser.getByteFrequencyData(dataArray);
        const minValue = 85; // 最低频率
        const maxValue = 255; // 最高频率
        const minIndex = Math.round(minValue * bufferLength / audioCtx.sampleRate);
        const maxIndex = Math.round(maxValue * bufferLength / audioCtx.sampleRate);
        let values = 0;
        let count = 0;
        for (let i = minIndex; i <= maxIndex; i++) {
          values += dataArray[i];
          count++;
        }
        let average = values / count;
        return average / 255 - silenceLimit;
      }

      // 开始录音
      recorder.onstart = (event:Event) => {
        console.log("Please Speek...");
        ms.success(t('message.start_recording'))
        recorderStatus.value = true;
      }

      // 网传处理，声音数据保存
      recorder.ondataavailable = (event:BlobEvent) => {
        // console.dir(getAverageVolume())
        recorderVolum.value = getAverageVolume()*100
        audioChunks.push(event.data)
        ws_socket?.send(event.data)
      }

      // 监听stop事件
      recorder.onstop = () => {
        recorderStatus.value = false;
        //录音播放，或者下载，或者暂存
        if(0)
        {
          // 将数组中的数据合并成一个Blob对象
          console.dir(recorder.mimeType)
          const blob = new Blob(audioChunks, { type: recorder.mimeType });

          // 创建一个URL来引用这个Blob对象，进行播放
          const url = URL.createObjectURL(blob);
          const audio:any = document.createElement("audio")
          audio.src = url;
          audio.play();
          // URL.revokeObjectURL(url);
        }
        ws_socket.close();
      };

      // 在这里使用录音器
      recorder.start(mstimeInterval)
    }).catch((error) => {
      console.dir(error)
      ms.error(t('message.fail_audio'))
    });
  });
      
  // 监听message事件，表示收到服务器转回的文字消息
  ws_socket.addEventListener("message", (event) => {
    // 打印出收到的消息
    console.log("Received: " + event.data);
    if(typeof event.data === 'string') {
      prompt.value = prompt.value + event.data;
    } else if(autoTalk){
      const mstimeout = 1000*2;
      console.dir(new Date()+" Start!")
      //静默超时的时候中断会话
      timoutFun = setTimeout(() => {
        //收到null表示语音识别中断，自动触发对话
        if(recorder?.state == "recording") {
          recorder.stop();
        }
        handleSubmit();
        console.dir(new Date() + "Go!")
      }, mstimeout);
    }
  });

  // 监听close事件，表示连接已关闭
  ws_socket.addEventListener("close", () => {
    // 做一些清理工作
    if(recorder?.state == "recording") {
      recorder.stop();
    }
    if(autoTalk && prompt.value.length>0) {
      handleSubmit();
    }
    console.log("Connection closed");
  });

  // // 监听error事件，表示发生了错误
  ws_socket.addEventListener("error", (error) => {
    recorder.stop()
    // 处理错误
    console.error(error);
  });
}

let timoutFun:NodeJS.Timeout|null = null;


//停止录音
function stopRecording(){
  recorder.stop();

  ms.success(t('message.end_recording'))
}

function handleRecord() {
  if(recorderStatus.value){
    stopRecording()
  }
  else {
    startRecording()
  }
}

// 录音状态
const recorderStatus = ref<boolean>(false);
// 当前录音音量
const recorderVolum = ref<number>(0);

watch(
  ()=>recorderVolum.value,
  (recorderVolum) => {
    if(timoutFun && recorderVolum>0) {
      if(timoutFun) {
        console.dir("clear")
        clearTimeout(timoutFun);
        timoutFun = null;
      }
    }
  },
  { immediate: true },
)

function handleSubmit() {
  onConversation()
}

async function onConversation() {
  let message = prompt.value

  if (loading.value)
    return

  if (!message || message.trim() === '')
    return

  controller = new AbortController()

  addChat(
    +uuid,
    {
      dateTime: new Date().toLocaleString(),
      text: message,
      inversion: true,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: null },
    },
  )
  scrollToBottom()

  loading.value = true
  prompt.value = ''

  let options: Chat.ConversationRequest = {}
  const lastContext = conversationList.value[conversationList.value.length - 1]?.conversationOptions

  if (lastContext && usingContext.value)
    options = { ...lastContext }

  addChat(
    +uuid,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      loading: true,
      inversion: false,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )
  scrollToBottom()

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      await fetchChatAPIProcess<Chat.ConversationResponse>({
        prompt: message,
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            updateChat(
              +uuid,
              dataSources.value.length - 1,
              {
                dateTime: new Date().toLocaleString(),
                text: lastText + (data.text ?? ''),
                inversion: false,
                error: false,
                loading: true,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
              },
            )

            if (openLongReply && data.detail.choices[0].finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }

            scrollToBottomIfAtBottom()
          }
          catch (error) {
            //
          }
        },
      })
      updateChatSome(+uuid, dataSources.value.length - 1, { loading: false })
    }

    await fetchChatAPIOnce()
  }
  catch (error: any) {
    const errorMessage = error?.message ?? t('common.wrong')

    if (error.message === 'canceled') {
      updateChatSome(
        +uuid,
        dataSources.value.length - 1,
        {
          loading: false,
        },
      )
      scrollToBottomIfAtBottom()
      return
    }

    const currentChat = getChatByUuidAndIndex(+uuid, dataSources.value.length - 1)

    if (currentChat?.text && currentChat.text !== '') {
      updateChatSome(
        +uuid,
        dataSources.value.length - 1,
        {
          text: `${currentChat.text}\n[${errorMessage}]`,
          error: false,
          loading: false,
        },
      )
      return
    }

    updateChat(
      +uuid,
      dataSources.value.length - 1,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
    scrollToBottomIfAtBottom()
  }
  finally {
    loading.value = false
  }
}

async function onRegenerate(index: number) {
  if (loading.value)
    return

  controller = new AbortController()

  const { requestOptions } = dataSources.value[index]

  let message = requestOptions?.prompt ?? ''

  let options: Chat.ConversationRequest = {}

  if (requestOptions.options)
    options = { ...requestOptions.options }

  loading.value = true

  updateChat(
    +uuid,
    index,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      inversion: false,
      error: false,
      loading: true,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      await fetchChatAPIProcess<Chat.ConversationResponse>({
        prompt: message,
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            updateChat(
              +uuid,
              index,
              {
                dateTime: new Date().toLocaleString(),
                text: lastText + (data.text ?? ''),
                inversion: false,
                error: false,
                loading: true,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
              },
            )

            if (openLongReply && data.detail.choices[0].finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }
          }
          catch (error) {
            //
          }
        },
      })
      updateChatSome(+uuid, index, { loading: false })
    }
    await fetchChatAPIOnce()
  }
  catch (error: any) {
    if (error.message === 'canceled') {
      updateChatSome(
        +uuid,
        index,
        {
          loading: false,
        },
      )
      return
    }

    const errorMessage = error?.message ?? t('common.wrong')

    updateChat(
      +uuid,
      index,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
  }
  finally {
    loading.value = false
  }
}

function handleExport() {
  if (loading.value)
    return

  const d = dialog.warning({
    title: t('chat.exportImage'),
    content: t('chat.exportImageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      try {
        d.loading = true
        const ele = document.getElementById('image-wrapper')
        const canvas = await html2canvas(ele as HTMLDivElement, {
          useCORS: true,
        })
        const imgUrl = canvas.toDataURL('image/png')
        const tempLink = document.createElement('a')
        tempLink.style.display = 'none'
        tempLink.href = imgUrl
        tempLink.setAttribute('download', 'chat-shot.png')
        if (typeof tempLink.download === 'undefined')
          tempLink.setAttribute('target', '_blank')

        document.body.appendChild(tempLink)
        tempLink.click()
        document.body.removeChild(tempLink)
        window.URL.revokeObjectURL(imgUrl)
        d.loading = false
        ms.success(t('chat.exportSuccess'))
        Promise.resolve()
      }
      catch (error: any) {
        ms.error(t('chat.exportFailed'))
      }
      finally {
        d.loading = false
      }
    },
  })
}

function handleDelete(index: number) {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.deleteMessageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.deleteChatByUuid(+uuid, index)
    },
  })
}

function handleClear() {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.clearChat'),
    content: t('chat.clearChatConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.clearChatByUuid(+uuid)
    },
  })
}

function handleEnter(event: KeyboardEvent) {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
  else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

function handleStop() {
  if (loading.value) {
    controller.abort()
    loading.value = false
  }
}

// 可优化部分
// 搜索选项计算，这里使用value作为索引项，所以当出现重复value时渲染异常(多项同时出现选中效果)
// 理想状态下其实应该是key作为索引项,但官方的renderOption会出现问题，所以就需要value反renderLabel实现
const searchOptions = computed(() => {
  if (prompt.value.startsWith('/')) {
    return promptTemplate.value.filter((item: { key: string }) => item.key.toLowerCase().includes(prompt.value.substring(1).toLowerCase())).map((obj: { value: any }) => {
      return {
        label: obj.value,
        value: obj.value,
      }
    })
  }
  else {
    return []
  }
})

// value反渲染key
const renderOption = (option: { label: string }) => {
  for (const i of promptTemplate.value) {
    if (i.value === option.label)
      return [i.key]
  }
  return []
}

const placeholder = computed(() => {
  if (isMobile.value)
    return t('chat.placeholderMobile')
  return t('chat.placeholder')
})

const buttonDisabled = computed(() => {
  return loading.value || !prompt.value || prompt.value.trim() === ''
})

const footerClass = computed(() => {
  let classes = ['p-4']
  if (isMobile.value)
    classes = ['sticky', 'left-0', 'bottom-0', 'right-0', 'p-2', 'pr-3', 'overflow-hidden']
  return classes
})

onMounted(() => {
  scrollToBottom()
  if (inputRef.value && !isMobile.value)
    inputRef.value?.focus()
})

onUnmounted(() => {
  if (loading.value)
    controller.abort()
})
</script>

<template>
  <div class="flex flex-col w-full h-full">
    <HeaderComponent
      v-if="isMobile"
      :using-context="usingContext"
      @export="handleExport"
      @toggle-using-context="toggleUsingContext"
    />
    <main class="flex-1 overflow-hidden">
      <div id="scrollRef" ref="scrollRef" class="h-full overflow-hidden overflow-y-auto">
        <div
          id="image-wrapper"
          class="w-full max-w-screen-xl m-auto dark:bg-[#101014]"
          :class="[isMobile ? 'p-2' : 'p-4']"
        >
          <template v-if="!dataSources.length">
            <div class="flex items-center justify-center mt-4 text-center text-neutral-300">
              <SvgIcon icon="ri:bubble-chart-fill" class="mr-2 text-3xl" />
              <span>Aha~</span>
            </div>
          </template>
          <template v-else>
            <div>
              <Message
                v-for="(item, index) of dataSources"
                :key="index"
                :date-time="item.dateTime"
                :text="item.text"
                :inversion="item.inversion"
                :error="item.error"
                :loading="item.loading"
                @regenerate="onRegenerate(index)"
                @delete="handleDelete(index)"
              />
              <div class="sticky bottom-0 left-0 flex justify-center">
                <NButton v-if="loading" type="warning" @click="handleStop">
                  <template #icon>
                    <SvgIcon icon="ri:stop-circle-line" />
                  </template>
                  Stop Responding
                </NButton>
              </div>
            </div>
          </template>
        </div>
      </div>
    </main>
    <footer :class="footerClass">
      <div class="w-full max-w-screen-xl m-auto">
        <div class="flex items-center justify-between space-x-2">
          <HoverButton @click="handleClear">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:delete-bin-line" />
            </span>
          </HoverButton>
          <HoverButton v-if="!isMobile" @click="handleExport">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:download-2-line" />
            </span>
          </HoverButton>
          <HoverButton v-if="!isMobile" @click="toggleUsingContext">
            <span class="text-xl" :class="{ 'text-[#4b9e5f]': usingContext, 'text-[#a8071a]': !usingContext }">
              <SvgIcon icon="ri:chat-history-line" />
            </span>
          </HoverButton>
          <div style="width: -webkit-fill-available;">
            <NProgress v-if="recorderStatus" type="line" color="#4b9e5f" 
                      :height="2" :border-radius="4"
                      :percentage="recorderVolum" :show-indicator="false" />
            <NAutoComplete v-model:value="prompt" :options="searchOptions" :render-label="renderOption">
              <template #default="{ handleInput, handleBlur, handleFocus }">
                  <NInput
                    ref="inputRef"
                    v-model:value="prompt"
                    type="textarea"
                    :placeholder="placeholder"
                    :autosize="{ minRows: 1, maxRows: isMobile ? 4 : 8 }"
                    @input="handleInput"
                    @focus="handleFocus"
                    @blur="handleBlur"
                    @keypress="handleEnter"
                  >
                  </NInput>
              </template>
            </NAutoComplete>
          </div>
          <NButton type="primary" :disabled="buttonDisabled" @click="handleSubmit">
            <template #icon>
              <span class="dark:text-black">
                <SvgIcon icon="ri:send-plane-fill" />
              </span>
            </template>
          </NButton>
          <NButton type="primary" @click="handleRecord">
            <template #icon>
              <span class="dark:text-black">
                <SvgIcon :icon="recorderStatus?'ri:mic-fill':'ri:mic-off-fill'"/>
              </span>
            </template>
          </NButton>
        </div>
      </div>
    </footer>
  </div>
</template>
