<script lang="ts" setup>
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import mdKatex from '@traptitech/markdown-it-katex'
import mila from 'markdown-it-link-attributes'
import hljs from 'highlight.js'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { NCollapse, NCollapseItem, NText, NProgress, NPopover, NStatistic } from 'naive-ui'
import { SvgIcon } from '@/components/common'

interface Props {
  inversion?: boolean
  error?: boolean
  text?: string
  loading?: boolean
  asRawText?: boolean
  grade?:any
  voiceData?:Blob
}

const reason = new Map<string, string>([
  ["None", ""],
  ["Omission", "warning"],
  ["Insertion", "success"],
  ["Mispronunciation", "error"],
]);

const props = defineProps<Props>()

const { isMobile } = useBasicLayout()

const textRef = ref<HTMLElement>()

const mdi = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, { blockClass: 'katexmath-block rounded-md p-[10px]', errorColor: ' #cc0000' })

const wrapClass = computed(() => {
  return [
    'text-wrap',
    'min-w-[20px]',
    'rounded-md',
    isMobile.value ? 'p-2' : 'px-3 py-2',
    props.inversion ? 'bg-[#d2f9d1]' : 'bg-[#f4f6f8]',
    props.inversion ? 'dark:bg-[#a1dc95]' : 'dark:bg-[#1e1e20]',
    props.inversion ? 'message-request' : 'message-reply',
    { 'text-red-500': props.error },
  ]
})

const text = computed(() => {
  const value = props.text ?? ''
  if (!props.asRawText)
    return mdi.render(value)
  return value
})

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t('chat.copyCode')}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`
}

function playVoiceRecord(blob?:Blob) {
  if (blob instanceof Blob) {
    const url = URL.createObjectURL(blob);
    console.dir(url)
    const audio:any = document.createElement("audio")
    audio.src = url;
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
    });
    audio.play();
  }
}

function canbePlay(blob?:Blob) {
  return blob instanceof Blob;
}

defineExpose({ textRef })
</script>

<template>
  <div class="text-black" :class="wrapClass">
    <div ref="textRef" class="leading-relaxed break-words">
      <div v-if="!inversion">
        <div v-if="!asRawText" class="markdown-body" v-html="text" />
        <div v-else class="whitespace-pre-wrap" v-text="text" />
      </div>
      <div v-else-if="grade?.NBest[0].PronunciationAssessment">
        <n-collapse>
          <template #arrow>
            <SvgIcon icon='ri:rhythm-fill'/>
          </template>
          <n-collapse-item>
            <div style="width: 100%; display: flex;flex-direction: column;align-items: flex-start;">
              <div style="display: flex;flex-direction: row;align-items: stretch;">
                <button v-if="canbePlay(voiceData)" style="margin-right: 3px;" @click=playVoiceRecord(voiceData) >
                  <SvgIcon icon="ri:user-voice-line" />
                </button>
                <n-popover v-for="item in grade.NBest[0].Words" trigger="hover">
                  <template #trigger>
                    <n-text class="whitespace-pre-wrap" :type="reason.get(item.PronunciationAssessment.ErrorType as string)">
                      {{ item.Word+" " }}
                    </n-text>
                  </template>
                  <span>
                    {{ `Error:${item.PronunciationAssessment.ErrorType}` }}
                    <n-statistic label="Score" :value="item.PronunciationAssessment.AccuracyScore">
                      <template #suffix>
                        / 100
                      </template>
                    </n-statistic>
                  </span>
                </n-popover>
              </div>
              <div style="width: 18em">
              <n-progress
                type="line"
                status="default"
                :height="8"
                :percentage="grade.NBest[0].PronunciationAssessment.PronScore"
              >{{ "评分:"+grade.NBest[0].PronunciationAssessment.PronScore }}</n-progress>
              <n-progress
                type="line"
                status="success"
                :height="5"
                :percentage="grade.NBest[0].PronunciationAssessment.AccuracyScore"
              >{{ "准确度:\t"+grade.NBest[0].PronunciationAssessment.AccuracyScore }}</n-progress>
              <n-progress
                type="line"
                status="error"
                :height="5"
                :percentage="grade.NBest[0].PronunciationAssessment.CompletenessScore"
              >{{ "完整度:\t"+grade.NBest[0].PronunciationAssessment.CompletenessScore }}</n-progress>
              <n-progress
                type="line"
                status="warning"
                :height="5"
                :percentage="grade.NBest[0].PronunciationAssessment.FluencyScore"
              >{{ "流利度:\t"+grade.NBest[0].PronunciationAssessment.FluencyScore }}</n-progress>
              </div>
            </div>
            <template #header>
              <div class="whitespace-pre-wrap" v-text="text" />
            </template>
          </n-collapse-item>
        </n-collapse>
      </div>
      <div v-else>
        <div class="whitespace-pre-wrap" v-text="text" />
      </div>
      <template v-if="loading">
        <span class="dark:text-white w-[4px] h-[20px] block animate-blink" />
      </template>
    </div>
  </div>
</template>

<style lang="less">
@import url(./style.less);
</style>
