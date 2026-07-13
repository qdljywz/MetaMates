import { useCallback, useState } from 'react'

import { storageService } from '../services/storage'
import { DEFAULT_AGENT_MODE } from '../utils/agentConnectionStatus'

type ModelOption = { id: string; name: string }

export interface ApplyAgentRuntimeMetadataArgs {
  backend: string
  persistAcpPreference: (backend: string, patch: { mode?: string; modelId?: string }) => Promise<void>
  setSelectedMode: (mode: string) => void
  setModels: (models: ModelOption[]) => void
  setSelectedModel: (modelId: string) => void
  setAcpDynamicCommands?: (commands: Array<{ name: string; description?: string }>) => void
}

export function useAgentRuntime() {
  const [modelReadOnly, setModelReadOnly] = useState(false)
  const [modelProvenance, setModelProvenance] = useState<string | null>(null)

  const resetModelRuntime = useCallback(() => {
    setModelReadOnly(false)
    setModelProvenance(null)
  }, [])

  const clearAcpModelPreference = useCallback(async (backend: string) => {
    try {
      const settings = await storageService.getSettings()
      const existing = settings.acpPreferences?.[backend]
      if (!existing?.modelId) return
      const { modelId: _removed, ...rest } = existing
      const nextPrefs = { ...(settings.acpPreferences || {}) }
      if (Object.keys(rest).length > 0) {
        nextPrefs[backend] = rest
      } else {
        delete nextPrefs[backend]
      }
      await storageService.saveSettings({ acpPreferences: nextPrefs })
    } catch {
      // best-effort
    }
  }, [])

  const applyRuntimeMetadata = useCallback(async ({
    backend,
    persistAcpPreference,
    setSelectedMode,
    setModels,
    setSelectedModel,
    setAcpDynamicCommands,
  }: ApplyAgentRuntimeMetadataArgs) => {
    try {
      const settings = await storageService.getSettings()
      const pref = settings.acpPreferences?.[backend]
      const runtime = await window.electronAPI?.acp.getAgentRuntime?.(backend)

      if (pref?.mode) {
        try {
          await window.electronAPI?.acp.setMode(pref.mode)
          setSelectedMode(pref.mode)
        } catch {
          const modeResult = await window.electronAPI?.acp.getMode()
          setSelectedMode(modeResult?.mode || DEFAULT_AGENT_MODE)
        }
      } else {
        const modeResult = await window.electronAPI?.acp.getMode()
        setSelectedMode(modeResult?.mode || DEFAULT_AGENT_MODE)
      }

      const cliLockedModel = runtime && !runtime.capabilities.canSwitchModel
      setModelReadOnly(!!cliLockedModel)
      setModelProvenance(runtime?.display.provenanceModel ?? null)

      const modelsResult = await window.electronAPI?.acp.getModels()
      if (modelsResult?.models) {
        setModels(modelsResult.models)
        if (modelsResult.models.length > 0) {
          if (cliLockedModel && runtime?.display.effectiveModel) {
            const envModel = runtime.display.effectiveModel
            const merged = modelsResult.models.some((m) => m.id === envModel)
              ? modelsResult.models
              : [{ id: envModel, name: envModel }, ...modelsResult.models]
            setModels(merged)
            setSelectedModel(envModel)
            try {
              await window.electronAPI?.acp.setModel(envModel)
            } catch {
              // main process syncs from CLI settings; best-effort
            }
            void clearAcpModelPreference(backend)
          } else {
            const sessionInfo = await window.electronAPI?.acp.getSessionInfo?.(backend)
            const userModelId = pref?.modelId
            const sessionModelId = sessionInfo?.modelId
            const autoModel = backend === 'gemini'
              ? modelsResult.models.find((m) => /auto/i.test(m.id) || /auto/i.test(m.name))
              : undefined
            const pick = userModelId && modelsResult.models.some((m) => m.id === userModelId)
              ? userModelId
              : (backend === 'gemini' && autoModel?.id)
                ? autoModel.id
                : sessionModelId && modelsResult.models.some((m) => m.id === sessionModelId)
                  ? sessionModelId
                  : modelsResult.models[0].id
            try {
              await window.electronAPI?.acp.setModel(pick)
            } catch {
              // best-effort
            }
            setSelectedModel(pick)
            void persistAcpPreference(backend, { modelId: pick })
          }
        }
      } else if (cliLockedModel && runtime?.display.effectiveModel) {
        const envModel = runtime.display.effectiveModel
        setModels([{ id: envModel, name: envModel }])
        setSelectedModel(envModel)
        try {
          await window.electronAPI?.acp.setModel(envModel)
        } catch {
          // best-effort
        }
        void clearAcpModelPreference(backend)
      }

      const acpCommands = await window.electronAPI?.acp.getAvailableCommands?.(backend)
      if (acpCommands && acpCommands.length > 0 && setAcpDynamicCommands) {
        setAcpDynamicCommands(acpCommands)
      }
    } catch {
      // metadata is best-effort
    }
  }, [clearAcpModelPreference])

  return {
    modelReadOnly,
    modelProvenance,
    resetModelRuntime,
    clearAcpModelPreference,
    applyRuntimeMetadata,
  }
}
