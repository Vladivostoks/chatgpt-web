import { ss } from '@/utils/storage'

const LOCAL_NAME = 'talkingStorage'

export interface TalkingStore {
  commentAccent: boolean,
  voiceLanguage: string,
  voice: string,
  recognizeLanguage: string,
  autoSpeak: boolean,
  autoSpeakMstimeout: number,
}

export function defaultSetting(): TalkingStore {
  return {
    commentAccent: false,
    voiceLanguage: 'en-US',
    voice: 'en-US-AmberNeural',
    recognizeLanguage: 'en-US',
    autoSpeak: false,
    autoSpeakMstimeout: 2000,
  }
}

export function getLocalState(): TalkingStore {
  const localSetting: TalkingStore | undefined = ss.get(LOCAL_NAME)
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: TalkingStore): void {
  ss.set(LOCAL_NAME, setting)
}

export function removeLocalState() {
  ss.remove(LOCAL_NAME)
}
