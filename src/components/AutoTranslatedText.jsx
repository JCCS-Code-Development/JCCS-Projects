import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectLanguage, translateText } from '../utils/translate'

// Wraps any user-typed free text (daily log descriptions, comments, weekly
// report sections, ...) and auto-translates it to match the viewer's
// current UI language WHEN the text was actually written in the other
// one — detected client-side (no network call), translated via a free API
// only when needed. Always shows a small disclaimer plus a toggle back to
// the original — this never silently rewrites what someone typed.
export default function AutoTranslatedText({ text, as: Tag = 'p', className = '' }) {
  const { i18n, t } = useTranslation()
  const [translated, setTranslated] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const uiLang = i18n.language?.split('-')[0] === 'es' ? 'es' : 'en'

  useEffect(() => {
    setTranslated(null)
    setShowOriginal(false)
    const sourceLang = detectLanguage(text)
    if (!sourceLang || sourceLang === uiLang) return
    let cancelled = false
    translateText(text, sourceLang, uiLang).then((result) => {
      if (!cancelled && result && result.trim() && result.trim() !== text.trim()) setTranslated(result)
    })
    return () => { cancelled = true }
  }, [text, uiLang])

  if (!text) return null

  return (
    <>
      <Tag className={className}>{translated && !showOriginal ? translated : text}</Tag>
      {translated && (
        <button type="button" onClick={() => setShowOriginal((s) => !s)}
          className="block text-[11px] text-gray-400 hover:text-gray-600 italic mt-0.5">
          {showOriginal ? t('translate.showTranslated') : t('translate.disclaimer')}
        </button>
      )}
    </>
  )
}
