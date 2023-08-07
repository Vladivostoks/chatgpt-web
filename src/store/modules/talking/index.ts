import { defineStore } from 'pinia'
import type { TalkingStore } from './helper'
import { defaultSetting, getLocalState, removeLocalState, setLocalState } from './helper'

export const useTalkingStore = defineStore('talking-store', {
  state: (): TalkingStore => getLocalState(),
  actions: {
    updateSetting(settings: Partial<TalkingStore>) {
      this.$state = { ...this.$state, ...settings }
      this.recordState()
    },

    resetSetting() {
      this.$state = defaultSetting()
      removeLocalState()
    },

    recordState() {
      setLocalState(this.$state)
    },
  },
})
