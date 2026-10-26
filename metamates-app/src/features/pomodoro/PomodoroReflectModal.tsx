import React, { useEffect, useState } from 'react'
import { Input, Modal } from 'antd'
import { useTranslation } from 'react-i18next'

export interface PomodoroReflectModalProps {
  open: boolean
  durationMin: number
  onWrite: (note: string) => void
  onSkip: () => void
}

/**
 * Ask what was done after a focus session ends.
 */
const PomodoroReflectModal: React.FC<PomodoroReflectModalProps> = ({
  open,
  durationMin,
  onWrite,
  onSkip,
}) => {
  const { t } = useTranslation('common')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) setNote('')
  }, [open])

  return (
    <Modal
      open={open}
      title={t('pomodoro.reflectTitle')}
      okText={t('pomodoro.writeDiary')}
      cancelText={t('pomodoro.skip')}
      onOk={() => onWrite(note)}
      onCancel={onSkip}
      destroyOnClose
      className="pomodoro-reflect-modal"
      rootClassName="pomodoro-reflect-modal-root"
      okButtonProps={{ 'data-testid': 'pomodoro-reflect-write' } as Record<string, string>}
      cancelButtonProps={{ 'data-testid': 'pomodoro-reflect-skip' } as Record<string, string>}
    >
      <p style={{ marginBottom: 8 }}>
        {t('pomodoro.reflectHint', { minutes: durationMin })}
      </p>
      <Input.TextArea
        data-testid="pomodoro-reflect-input"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('pomodoro.reflectPlaceholder')}
        autoFocus
      />
    </Modal>
  )
}

export default PomodoroReflectModal
