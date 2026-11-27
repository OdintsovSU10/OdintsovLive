import type { TSeatTone } from './officeModel'
import styles from './Office.module.css'

// Классы тонов статуса (задают --tone-color и --tone-text): общие для списка, плана и подписей 3D
export const TONE_CLASS: Record<TSeatTone, string> = {
  office: styles.toneOffice,
  left: styles.toneLeft,
  none: styles.toneNone,
  leave: styles.toneLeave,
  loading: styles.toneLoading,
  unavailable: styles.toneUnavailable
}
