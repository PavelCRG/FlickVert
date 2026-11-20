import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { relaunch } from '@tauri-apps/plugin-process'
import type { Language } from '../settings'
import { AppIcon } from '../icons/AppIcon'
import { shouldNotifyUpdate, updateActionForStatus, type UpdateStatus } from './update-notification'

type UpdateState = { status: UpdateStatus; version: string; currentVersion: string; progress: number | null; portableFailure: boolean; checkUpdate: () => Promise<void>; installUpdate: () => Promise<void> }
const Context = createContext<UpdateState | null>(null)

const copy = {
  en: { title: 'Updates', checking: 'Checking for updates…', current: 'You have the latest version.', available: 'Version {version} is ready to install.', downloading: 'Downloading update…', error: 'Could not update FlickVert. Your current version is still available.', portableError: 'The update could not be applied. Keep this version, move the portable folder to a writable location, and try again.', unsupported: 'Update checks are unavailable for this build.', check: 'Check for updates', install: 'Download and install', retry: 'Try again', currentVersion: 'Current version', progress: 'Download progress' },
  ru: { title: 'Обновления', checking: 'Проверяем обновления…', current: 'Установлена последняя версия.', available: 'Версия {version} готова к установке.', downloading: 'Скачиваем обновление…', error: 'Не удалось обновить FlickVert. Текущая версия сохранена.', portableError: 'Не удалось применить обновление. Текущая версия сохранена. Переместите portable-папку в доступное для записи место и повторите попытку.', unsupported: 'Проверка обновлений недоступна для этой сборки.', check: 'Проверить обновления', install: 'Скачать и установить', retry: 'Повторить', currentVersion: 'Текущая версия', progress: 'Загрузка' },
  zh: { title: '更新', checking: '正在检查更新…', current: '已是最新版本。', available: '版本 {version} 已可安装。', downloading: '正在下载更新…', error: '更新失败。当前版本仍可使用。', portableError: '无法应用更新，当前版本仍可使用。请将便携版文件夹移到可写入的位置后重试。', unsupported: '此版本无法检查更新。', check: '检查更新', install: '下载并安装', retry: '重试', currentVersion: '当前版本', progress: '下载进度' },
} as const

export function UpdateProvider({ language, children }: { language: Language; children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('checking')
  const [version, setVersion] = useState('')
  const [currentVersion, setCurrentVersion] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [portableFailure, setPortableFailure] = useState(false)
  const update = useRef<Update | null>(null)
  const channel = useRef<'installer' | 'portable' | 'unsupported'>('unsupported')
  const busy = useRef(false)
  const downloadedBytes = useRef(0)
  const totalBytes = useRef(0)
  const languageRef = useRef(language)
  languageRef.current = language

  async function notify(version: string) {
    const storageKey = 'flickvert:last-update-notification'
    if (!shouldNotifyUpdate(version, localStorage.getItem(storageKey))) return
    try {
      let granted = await isPermissionGranted()
      if (!granted) granted = await requestPermission() === 'granted'
      if (granted) { sendNotification({ title: 'FlickVert', body: `${copy[languageRef.current].available.replace('{version}', version)}` }); localStorage.setItem(storageKey, version) }
    } catch {}
  }

  async function checkUpdate() {
    if (!isTauri() || busy.current) return
    busy.current = true
    setPortableFailure(false)
    setStatus('checking')
    try {
      setCurrentVersion(await getVersion())
      channel.current = await invoke<'installer' | 'portable' | 'unsupported'>('windows_update_channel')
      await update.current?.close()
      update.current = null
      if (channel.current === 'unsupported') { setStatus('unsupported'); return }
      const found = await check(channel.current === 'portable' ? { target: 'windows-x86_64-portable', timeout: 15000 } : { timeout: 15000 })
      update.current = found
      setVersion(found?.version ?? '')
      setStatus(found ? 'available' : 'current')
      if (found) void notify(found.version)
    } catch { setStatus('error') }
    finally { busy.current = false }
  }

  async function installUpdate() {
    if (busy.current || status !== 'available') return
    busy.current = true
    setPortableFailure(false)
    setProgress(0)
    setStatus('downloading')
    try {
      if (channel.current === 'portable') await invoke('install_portable_update')
      else if (update.current) { await update.current.downloadAndInstall((event) => { if (event.event === 'Started') { downloadedBytes.current = 0; totalBytes.current = event.data.contentLength ?? 0; setProgress(0) } if (event.event === 'Progress') { downloadedBytes.current += event.data.chunkLength; if (totalBytes.current) setProgress(Math.min(100, Math.round(downloadedBytes.current / totalBytes.current * 100))) } }); await relaunch() }
    } catch { setPortableFailure(channel.current === 'portable'); setStatus('error') }
    finally { busy.current = false }
  }

  useEffect(() => {
    void checkUpdate()
    const timer = window.setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000)
    let unlisten: (() => void) | undefined
    void listen<[number, number | null]>('flickvert://update-progress', (event) => {
      const [chunk, total] = event.payload
      downloadedBytes.current += chunk
      totalBytes.current = total ?? 0
      setProgress(total ? Math.min(100, Math.round(downloadedBytes.current / total * 100)) : null)
    }).then((stop) => { unlisten = stop })
    return () => { window.clearInterval(timer); unlisten?.(); void update.current?.close(); update.current = null }
  }, [])

  return <Context.Provider value={{ status, version, currentVersion, progress, portableFailure, checkUpdate, installUpdate }}>{children}</Context.Provider>
}

function useUpdates() {
  const state = useContext(Context)
  if (!state) throw new Error('UpdateProvider is missing')
  return state
}

export function UpdateNotice({ language, onOpenAbout }: { language: Language; onOpenAbout: () => void }) {
  const { status } = useUpdates()
  return <button type="button" className="update-compact" onClick={onOpenAbout} aria-label={`${copy[language].title}: ${copy[language][status]}`}>
    <span className={`update-icon update-icon-${status}`}><AppIcon name={status === 'available' ? 'download' : status === 'error' ? 'alert' : 'refresh'}/></span><span>{copy[language].title}</span><i className={`update-indicator update-indicator-${status}`} aria-hidden="true"/>
  </button>
}

export function UpdatePanel({ language }: { language: Language }) {
  const labels = copy[language]
  const { status, version, currentVersion, progress, portableFailure, checkUpdate, installUpdate } = useUpdates()
  const action = updateActionForStatus(status)
  const message = status === 'available' ? labels.available.replace('{version}', version) : status === 'downloading' && progress !== null ? `${labels.downloading} ${progress}%` : status === 'error' && portableFailure ? labels.portableError : labels[status]
  return <section className="settings-group update-panel" aria-labelledby="updates-title">
    <h2 id="updates-title">{labels.title}</h2>
    <div className={`update-state update-state-${status}`} aria-live="polite"><span className="update-state-icon" aria-hidden="true">{status === 'current' ? <AppIcon name="check"/> : status === 'error' ? <AppIcon name="alert"/> : <span/>}</span><span>{message}</span></div>
    {status === 'downloading' && <progress aria-label={labels.progress} max="100" value={progress ?? undefined}/>}
    <p className="catalog-note">{labels.currentVersion}: {currentVersion || '—'}</p>
    {action === 'install'
      ? <button className="primary-button update-button" onClick={() => void installUpdate()}><AppIcon name="download"/>{labels.install}</button>
      : <button className="secondary-button update-button" disabled={!action} onClick={() => void checkUpdate()}><AppIcon name="refresh"/>{status === 'error' ? labels.retry : labels.check}</button>}
  </section>
}
