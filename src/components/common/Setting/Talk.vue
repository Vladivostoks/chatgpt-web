<script lang="ts" setup>
import { computed, ref, Ref } from 'vue'
import { NButton, NInput, NPopconfirm, NSelect, useMessage, NSwitch, NSlider } from 'naive-ui'
import type { Language, Theme } from '@/store/modules/app/helper'
import { SvgIcon } from '@/components/common'
import { useTalkingStore } from '@/store'
import type { UserInfo } from '@/store/modules/user/helper'
import { getCurrentDate } from '@/utils/functions'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { SpeechSynthesisVoices, SpeechSynthesisLanguagesLocale, 
         SpeechRecognitionLanguages, SpeechRecognitionLanguagesLocale} from './data.ts'

const isIOS = /iPhone/.test(navigator.userAgent);
const allowAutoTalk:boolean = isIOS?false:true;

const talkingStore = useTalkingStore()
const ms = useMessage()

const autoSpeak = ref(talkingStore.autoSpeak ?? false)
const autoSpeakMstimeout = ref(talkingStore.autoSpeakMstimeout ?? 2000)
const commentAccent = ref(talkingStore.commentAccent ?? false)

const recognizeLanguage = ref(talkingStore.voiceLanguage ?? '')
const recognizeLanguageOption = computed(()=>{
  let ret:{
    label: string,
    value: string,
  }[] = []
  for(const key in SpeechRecognitionLanguagesLocale) {
    ret.push({
      label: SpeechRecognitionLanguagesLocale[key],
      value: key,
    })
  }
  return ret;
});

const voiceLanguage = ref(talkingStore.voiceLanguage ?? '')
const voiceLanguageOptions = computed(()=>{
  let ret:{
    label: string,
    value: string,
  }[] = []
  for(const key in SpeechSynthesisLanguagesLocale) {
    ret.push({
      label: SpeechSynthesisLanguagesLocale[key],
      value: key,
    })
  }
  return ret;
});

const voice = computed({
  get() {
    if(talkingStore.voice && talkingStore.voice.includes(voiceLanguage.value)) {
      return talkingStore.voice;
    }
    return SpeechSynthesisVoices[voiceLanguage.value][0];
  },
  set(value: string) {
    talkingStore.updateSetting({
      voice:value
    })
  },
})

const voiceOptions = computed(()=>{
  let ret:{
    label: string,
    value: string,
  }[] = []
  for(const i in SpeechSynthesisVoices[voiceLanguage.value]) {
    ret.push({
      label: SpeechSynthesisVoices[voiceLanguage.value][i],
      value: SpeechSynthesisVoices[voiceLanguage.value][i],
    })
  }
  return ret;
});

function handleReset() {
  talkingStore.resetSetting();
  ms.success(t('common.success'))
  window.location.reload();
}

</script>

<template>
  <div class="p-4 space-y-5 min-h-[200px]">
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.commentAccent') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSwitch :round="false" 
                   v-model:value="commentAccent"
                   @update-value="value => {
                     talkingStore.updateSetting({
                       commentAccent:value
                     });
                   }"
          />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.recognizeLanguage') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSelect
            style="width: 200px"
            v-model:value="recognizeLanguage"
            :options="recognizeLanguageOption"
            @update-value="value => {
              talkingStore.updateSetting({
                recognizeLanguage:value
              });
            }"
          />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.voiceLanguage') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSelect
            style="width: 200px"
            v-model:value="voiceLanguage"
            :options="voiceLanguageOptions"
            @update-value="value => {
              talkingStore.updateSetting({
                voiceLanguage:value
              });
            }"
          />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.voice') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSelect
            style="width: 200px"
            v-model:value="voice"
            :options="voiceOptions"
          />
        </div>
      </div>
      <div v-if="allowAutoTalk" class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.autoSpeak') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSwitch :round="false" 
                   v-model:value="autoSpeak"
                   @update-value="value => {
                     talkingStore.updateSetting({
                       autoSpeak:value
                     });
                   }"
          />
        </div>
      </div>
      <div v-if="autoSpeak" class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.autoSpeakMstimeout') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSlider v-model:value="autoSpeakMstimeout" 
                   style="width: 200px"
                   :max='5000'
                   :min="0"
                   :step="100" 
                   @update-value="value => {
                     talkingStore.updateSetting({
                       autoSpeakMstimeout:value
                     });
                   }"
          />
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.resetTalkingSetting') }}</span>
        <NButton size="small" @click="handleReset">
          {{ $t('common.reset') }}
        </NButton>
      </div>
    </div>
  </div>
</template>
