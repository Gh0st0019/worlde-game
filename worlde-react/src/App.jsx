import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseReady } from './lib/supabaseClient'
import { WORD_THEMES } from './data/wordBank'
import './App.css'

const MAX_ATTEMPTS = 10
const MAX_USERNAME_LENGTH = 5
const RECENT_WORDS_LIMIT = 60
const RECENT_THEMES_LIMIT = 12
const START_DURATION_MS = 4600
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

const getStoredLevel = () => {
  if (typeof window === 'undefined') {
    return 1
  }
  const stored = Number(window.localStorage.getItem('worldeLevel'))
  return Number.isFinite(stored) && stored > 0 ? stored : 1
}

const getStoredCoins = () => {
  if (typeof window === 'undefined') {
    return 0
  }
  const stored = Number(window.localStorage.getItem('worldeCoins'))
  return Number.isFinite(stored) && stored >= 0 ? stored : 0
}

const getStoredRecentWords = () => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem('worldeRecentWords') || '[]')
    return Array.isArray(stored) ? stored.filter((word) => typeof word === 'string') : []
  } catch {
    return []
  }
}

const storeRecentWords = (words) => {
  if (typeof window === 'undefined') {
    return
  }
  const trimmed = words.slice(0, RECENT_WORDS_LIMIT)
  window.localStorage.setItem('worldeRecentWords', JSON.stringify(trimmed))
}

const getStoredRecentThemes = () => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem('worldeRecentThemes') || '[]')
    return Array.isArray(stored) ? stored.filter((theme) => typeof theme === 'string') : []
  } catch {
    return []
  }
}

const storeRecentThemes = (themes) => {
  if (typeof window === 'undefined') {
    return
  }
  const trimmed = themes.slice(0, RECENT_THEMES_LIMIT)
  window.localStorage.setItem('worldeRecentThemes', JSON.stringify(trimmed))
}

const sanitizePlayerName = (value) =>
  value.replace(/\s+/g, '').slice(0, MAX_USERNAME_LENGTH).toUpperCase()

const getStoredPlayerName = () => {
  if (typeof window === 'undefined') {
    return ''
  }
  const stored = window.localStorage.getItem('worldePlayerName')
  return stored ? sanitizePlayerName(stored) : ''
}

const storePlayerName = (name) => {
  if (typeof window === 'undefined') {
    return
  }
  if (!name) {
    window.localStorage.removeItem('worldePlayerName')
    return
  }
  window.localStorage.setItem('worldePlayerName', name)
}

const getRandomInt = (max) => {
  if (max <= 0) {
    return 0
  }
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const maxUint32 = 0xffffffff
    const limit = maxUint32 - (maxUint32 % max)
    const buffer = new Uint32Array(1)
    let value = 0
    do {
      window.crypto.getRandomValues(buffer)
      value = buffer[0]
    } while (value >= limit)
    return value % max
  }
  return Math.floor(Math.random() * max)
}

const hasGoogleIdentity = (user) => {
  if (!user) {
    return false
  }
  if (user.app_metadata?.provider === 'google') {
    return true
  }
  if (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) {
    return true
  }
  return Array.isArray(user.identities)
    ? user.identities.some((identity) => identity.provider === 'google')
    : false
}

const getPendingGoogleBonus = () => {
  if (typeof window === 'undefined') {
    return false
  }
  return window.localStorage.getItem('worldePendingGoogleBonus') === '1'
}

const setPendingGoogleBonus = () => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem('worldePendingGoogleBonus', '1')
}

const clearPendingGoogleBonus = () => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem('worldePendingGoogleBonus')
}

const getMinLengthForLevel = (level) => Math.min(8, 4 + Math.floor((level - 1) / 2))

const pickRandomWord = (level, recentWords = [], recentThemes = []) => {
  const minLength = getMinLengthForLevel(level)
  const recentSet = new Set(recentWords)
  const recentThemeSet = new Set(recentThemes)
  const themeEntries = Object.entries(WORD_THEMES)
    .map(([theme, words]) => {
      const eligible = words.filter((word) => word.length >= minLength)
      const filtered = eligible.filter((word) => !recentSet.has(word))
      return {
        theme,
        eligible,
        filtered,
      }
    })
    .filter((entry) => entry.eligible.length > 0)

  if (!themeEntries.length) {
    return { word: '', theme: '' }
  }

  const availableThemes = themeEntries.filter((entry) => entry.filtered.length > 0)
  const themePool = availableThemes.length ? availableThemes : themeEntries
  const themeFiltered = themePool.filter((entry) => !recentThemeSet.has(entry.theme))
  const finalThemePool = themeFiltered.length ? themeFiltered : themePool
  const chosenTheme = finalThemePool[getRandomInt(finalThemePool.length)]
  const wordPool = chosenTheme.filtered.length ? chosenTheme.filtered : chosenTheme.eligible
  const word = wordPool[getRandomInt(wordPool.length)]
  return { word, theme: chosenTheme.theme }
}

function App() {
  const [word, setWord] = useState('')
  const [guessedWord, setGuessedWord] = useState([])
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [maxAttempts, setMaxAttempts] = useState(MAX_ATTEMPTS)
  const [coins, setCoins] = useState(getStoredCoins)
  const [playerName, setPlayerName] = useState(getStoredPlayerName)
  const [nameDraft, setNameDraft] = useState('')
  const [recentWords, setRecentWords] = useState(getStoredRecentWords)
  const [recentThemes, setRecentThemes] = useState(getStoredRecentThemes)
  const [wordTheme, setWordTheme] = useState('')
  const [googleBonusGranted, setGoogleBonusGranted] = useState(false)
  const [message, setMessage] = useState('Inserisci una lettera per iniziare.')
  const [gameState, setGameState] = useState('playing')
  const [showStart, setShowStart] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [localGuest, setLocalGuest] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [letterStatus, setLetterStatus] = useState({})
  const [level, setLevel] = useState(getStoredLevel)
  const levelRef = useRef(level)
  const maxAttemptsRef = useRef(maxAttempts)
  const coinsRef = useRef(coins)
  const recentWordsRef = useRef(recentWords)
  const recentThemesRef = useRef(recentThemes)
  const wordThemeRef = useRef(wordTheme)
  const nameInputRef = useRef(null)

  useEffect(() => {
    levelRef.current = level
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('worldeLevel', String(level))
    }
  }, [level])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('worldeCoins', String(coins))
    }
    coinsRef.current = coins
  }, [coins])

  useEffect(() => {
    maxAttemptsRef.current = maxAttempts
  }, [maxAttempts])

  useEffect(() => {
    recentWordsRef.current = recentWords
    storeRecentWords(recentWords)
  }, [recentWords])

  useEffect(() => {
    recentThemesRef.current = recentThemes
    storeRecentThemes(recentThemes)
  }, [recentThemes])

  useEffect(() => {
    wordThemeRef.current = wordTheme
  }, [wordTheme])

  useEffect(() => {
    if (!playerName) {
      setNameDraft('')
    }
  }, [playerName])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    if (playerName) {
      return undefined
    }
    const timer = window.setTimeout(() => nameInputRef.current?.focus(), 140)
    return () => window.clearTimeout(timer)
  }, [playerName])

  useEffect(() => {
    if (playerName) {
      return
    }
    const input = nameInputRef.current
    if (!input) {
      return
    }
    const length = input.value.length
    try {
      input.setSelectionRange(length, length)
    } catch {
      // Ignore selection errors for non-text inputs.
    }
  }, [nameDraft, playerName])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    root.dataset.theme = 'light'
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', '#f6efe4')
    }
  }, [])

  useEffect(() => {
    if (!supabaseReady || !supabase) {
      setAuthReady(true)
      return undefined
    }
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return
      }
      setAuthUser(data.session?.user ?? null)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return
      }
      setAuthUser(session?.user ?? null)
      setAuthReady(true)
    })
    return () => {
      isMounted = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (localGuest) {
      setProfileLoaded(true)
      return
    }
    if (!supabaseReady || !supabase) {
      return
    }
    if (!authUser) {
      setProfileLoaded(false)
      setWord('')
      setGuessedWord([])
      setAttemptsLeft(MAX_ATTEMPTS)
      setGoogleBonusGranted(false)
      clearPendingGoogleBonus()
      setMessage('Inserisci una lettera per iniziare.')
      setGameState('playing')
      setLetterStatus({})
      return
    }
    let cancelled = false
    const loadProfile = async () => {
      setAuthError('')
      setProfileLoaded(false)
      const pendingGoogleBonus = getPendingGoogleBonus()
      const { data, error } = await supabase
        .from('player_profiles')
        .select('*')
        .eq('user_id', authUser.id)
        .single()

      if (cancelled) {
        return
      }

      if (error && error.code !== 'PGRST116') {
        setAuthError('Impossibile caricare i dati dal server.')
        setProfileLoaded(true)
        return
      }

      const googleLinked = hasGoogleIdentity(authUser) || pendingGoogleBonus

      if (!data) {
        const bonus = googleLinked ? 100 : 0
        const nextCoins = coinsRef.current + bonus
        setCoins(nextCoins)
        setGoogleBonusGranted(googleLinked)
        const insertPayload = {
          user_id: authUser.id,
          level: levelRef.current,
          coins: nextCoins,
          max_attempts: maxAttemptsRef.current,
          recent_words: recentWordsRef.current,
          theme: wordThemeRef.current || 'Natura',
          google_bonus_granted: googleLinked,
          last_active_at: new Date().toISOString(),
        }
        const { error: insertError } = await supabase.from('player_profiles').insert(insertPayload)
        if (insertError) {
          setAuthError('Impossibile creare il profilo giocatore.')
        }
        if (googleLinked) {
          clearPendingGoogleBonus()
        }
        setProfileLoaded(true)
        return
      }

      const baseCoins = typeof data.coins === 'number' ? data.coins : 0
      const bonusNeeded = googleLinked && !data.google_bonus_granted
      const finalCoins = bonusNeeded ? baseCoins + 100 : baseCoins

      setLevel(typeof data.level === 'number' ? data.level : 1)
      setCoins(finalCoins)
      const nextMaxAttempts =
        typeof data.max_attempts === 'number' ? data.max_attempts : MAX_ATTEMPTS
      setMaxAttempts(nextMaxAttempts)
      maxAttemptsRef.current = nextMaxAttempts
      const storedTheme =
        typeof data.theme === 'string' && !['light', 'dark'].includes(data.theme)
          ? data.theme
          : ''
      setWordTheme(storedTheme)
      const nextRecent = Array.isArray(data.recent_words)
        ? data.recent_words.filter((word) => typeof word === 'string')
        : []
      setRecentWords(nextRecent)
      setGoogleBonusGranted(Boolean(data.google_bonus_granted) || bonusNeeded)

      if (bonusNeeded) {
        await supabase
          .from('player_profiles')
          .update({
            coins: finalCoins,
            google_bonus_granted: true,
            last_active_at: new Date().toISOString(),
          })
          .eq('user_id', authUser.id)
      }
      if (googleLinked) {
        clearPendingGoogleBonus()
      }
      setProfileLoaded(true)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [authUser, localGuest, supabaseReady])

  const saveProfile = useCallback(async () => {
    if (localGuest || !supabaseReady || !supabase || !authUser) {
      return
    }
    const payload = {
      user_id: authUser.id,
      level,
      coins,
      max_attempts: maxAttempts,
      recent_words: recentWords,
      theme: wordTheme || 'Natura',
      google_bonus_granted: googleBonusGranted,
      last_active_at: new Date().toISOString(),
    }
    await supabase.from('player_profiles').upsert(payload, { onConflict: 'user_id' })
  }, [authUser, coins, googleBonusGranted, level, localGuest, maxAttempts, recentWords, wordTheme])

  useEffect(() => {
    if (!authUser || !profileLoaded) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      saveProfile()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [authUser, profileLoaded, coins, level, maxAttempts, recentWords, wordTheme, saveProfile])

  const startNewGame = useCallback(() => {
    const currentRecent = recentWordsRef.current
    const currentThemes = recentThemesRef.current
    const { word: nextWord, theme: nextTheme } = pickRandomWord(
      levelRef.current,
      currentRecent,
      currentThemes
    )
    const nextRecent = [nextWord, ...currentRecent.filter((word) => word !== nextWord)]
    const nextThemes = [nextTheme, ...currentThemes.filter((theme) => theme !== nextTheme)]
    setRecentWords(nextRecent)
    setRecentThemes(nextThemes)
    setWord(nextWord)
    setWordTheme(nextTheme)
    setGuessedWord(Array(nextWord.length).fill('_'))
    setAttemptsLeft(maxAttemptsRef.current)
    setMessage('Inserisci una lettera per iniziare.')
    setGameState('playing')
    setLetterStatus({})
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    const timer = window.setTimeout(() => setShowStart(false), START_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const needsPlayerName = !playerName

  useEffect(() => {
    const hasPlayer = Boolean(authUser) || localGuest
    if (!showStart && hasPlayer && profileLoaded && !word && !needsPlayerName) {
      startNewGame()
    }
  }, [showStart, authUser, localGuest, profileLoaded, startNewGame, word, needsPlayerName])

  const applyGuess = useCallback(
    (rawLetter) => {
      if (
        showStart ||
        needsPlayerName ||
        (!authUser && !localGuest) ||
        !profileLoaded ||
        gameState !== 'playing'
      ) {
        return
      }

      const letter = rawLetter.trim().toLowerCase()
      if (!/^[a-z]$/.test(letter)) {
        setMessage('Inserisci una sola lettera (a-z).')
        return
      }

      const inWord = word.includes(letter)

      if (inWord) {
        const nextGuessed = guessedWord.map((current, index) =>
          word[index] === letter ? letter : current
        )
        setGuessedWord(nextGuessed)
        setLetterStatus((prev) => ({ ...prev, [letter]: 'hit' }))

        if (!nextGuessed.includes('_')) {
          const nextLevel = level + 1
          const reward = Math.max(1, attemptsLeft)
          setGameState('won')
          setLevel(nextLevel)
          setCoins((prev) => prev + reward)
          maxAttemptsRef.current = MAX_ATTEMPTS
          setMaxAttempts(MAX_ATTEMPTS)
          setMessage(`Complimenti!! Hai indovinato la parola: ${word}. Livello ${nextLevel}!`)
        } else {
          setMessage('Ottima lettera!')
        }
        return
      }

      const nextAttempts = attemptsLeft - 1
      setAttemptsLeft(nextAttempts)
      setLetterStatus((prev) => ({ ...prev, [letter]: 'miss' }))

      if (nextAttempts <= 0) {
        setGameState('lost')
        const reducedMax = maxAttempts - 2
        if (reducedMax > 0) {
          maxAttemptsRef.current = reducedMax
          setMaxAttempts(reducedMax)
          setMessage(
            `Hai finito i tentativi! La parola era: ${word}. Riprovi il livello ${level} con ${reducedMax} tentativi.`
          )
        } else {
          const nextLevel = Math.max(1, level - 1)
          maxAttemptsRef.current = MAX_ATTEMPTS
          setMaxAttempts(MAX_ATTEMPTS)
          setLevel(nextLevel)
          const levelMessage =
            nextLevel < level ? `Scendi al livello ${nextLevel}` : 'Resti al livello 1'
          setMessage(
            `Hai finito i tentativi! La parola era: ${word}. Game over. ${levelMessage} con ${MAX_ATTEMPTS} tentativi.`
          )
        }
      } else {
        setMessage(`Lettera errata! Tentativi rimasti: ${nextAttempts}`)
      }
    },
    [
      attemptsLeft,
      authUser,
      gameState,
      guessedWord,
      level,
      localGuest,
      maxAttempts,
      profileLoaded,
      showStart,
      word,
      needsPlayerName,
    ]
  )

  useEffect(() => {
    const handleKeydown = (event) => {
      if (
        showStart ||
        needsPlayerName ||
        (!authUser && !localGuest) ||
        !profileLoaded ||
        gameState !== 'playing'
      ) {
        return
      }
      if (event.target && event.target.tagName === 'INPUT') {
        return
      }
      const key = event.key.toLowerCase()
      if (/^[a-z]$/.test(key)) {
        applyGuess(key)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [applyGuess, authUser, gameState, localGuest, needsPlayerName, profileLoaded, showStart])

  const isSupabaseAnonymous = authUser?.is_anonymous === true
  const isAnonymous = localGuest || isSupabaseAnonymous

  const handleGuest = async () => {
    if (authBusy) {
      return
    }
    setAuthError('')
    setAuthBusy(true)
    if (!supabaseReady || !supabase) {
      setLocalGuest(true)
      setAuthBusy(false)
      return
    }
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      setLocalGuest(true)
      setAuthError('Accesso ospite locale attivo (progressi solo su questo dispositivo).')
    }
    setAuthBusy(false)
  }

  const handleGoogle = async () => {
    if (!supabaseReady || !supabase || authBusy) {
      return
    }
    setAuthError('')
    setAuthBusy(true)
    if (localGuest) {
      setPendingGoogleBonus()
      setLocalGuest(false)
      const redirectTo = (() => {
        if (typeof window === 'undefined') {
          return 'https://worlde.online'
        }
        const origin = window.location.origin
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return 'https://worlde.online'
        }
        return `${origin}${window.location.pathname}`
      })()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (error) {
        setAuthError('Accesso con Google non disponibile.')
      }
      setAuthBusy(false)
      return
    }
    if (isSupabaseAnonymous) {
      setPendingGoogleBonus()
      const { error } = await supabase.auth.linkIdentity({ provider: 'google' })
      if (error) {
        setAuthError('Impossibile collegare Google.')
      }
      setAuthBusy(false)
      return
    }
    setPendingGoogleBonus()
    const redirectTo = (() => {
      if (typeof window === 'undefined') {
        return 'https://worlde.online'
      }
      const origin = window.location.origin
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return 'https://worlde.online'
      }
      return `${origin}${window.location.pathname}`
    })()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) {
      setAuthError('Accesso con Google non disponibile.')
    }
    setAuthBusy(false)
  }

  const handleSignOut = async () => {
    if (authBusy) {
      return
    }
    setAuthError('')
    setAuthBusy(true)
    if (localGuest) {
      setLocalGuest(false)
      setProfileLoaded(false)
      setAuthBusy(false)
      return
    }
    if (!supabaseReady || !supabase) {
      setAuthBusy(false)
      return
    }
    await supabase.auth.signOut()
    setAuthBusy(false)
  }

  const wordLength = word.length
  const attemptIndices = Array.from({ length: maxAttempts }, (_, index) => index)

  const nameSlots = Array.from({ length: MAX_USERNAME_LENGTH }, (_, index) => {
    const char = nameDraft[index] || '_'
    const isEmpty = !nameDraft[index]
    return (
      <span
        key={`name-slot-${index}`}
        className={`name-slot ${isEmpty ? 'name-slot--empty' : 'name-slot--filled'}`}
        style={{
          '--wiggle-delay': `${index * 120}ms`,
          '--wiggle-duration': `${680 + index * 80}ms`,
        }}
      >
        {char}
      </span>
    )
  })

  if (showStart) {
    return (
      <div className="app-shell">
        <div className="start-screen" role="status" aria-live="polite">
          <div className="start-panel">
            <img className="start-gif" src="/earthspin.gif" alt="Pianeta che gira" />
            <div className="start-bar" aria-hidden="true">
              <div className="start-bar__fill" />
            </div>
            <div className="start-text">Caricamento...</div>
            <div className="start-fun" aria-live="polite">
              <div className="start-fun__line start-fun__line--a">Lucidando i pixel...</div>
              <div className="start-fun__line start-fun__line--b">Conto le vocali...</div>
              <div className="start-fun__line start-fun__line--c">Addestro il dizionario...</div>
              <div className="start-fun__line start-fun__line--d">Scaldo la tastiera...</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!supabaseReady && !localGuest) {
    return (
      <div className="app-shell">
        <div className="auth-screen" role="status" aria-live="polite">
          <div className="auth-panel">
            <div className="auth-title">Supabase non configurato</div>
            <div className="auth-error">
              Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authReady) {
    return (
      <div className="app-shell">
        <div className="start-screen" role="status" aria-live="polite">
          <div className="start-panel">
            <img className="start-gif" src="/earthspin.gif" alt="Pianeta che gira" />
            <div className="start-bar" aria-hidden="true">
              <div className="start-bar__fill" />
            </div>
            <div className="start-text">Connessione...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!authUser && !localGuest) {
    return (
      <div className="app-shell">
        <div className="auth-screen" role="status" aria-live="polite">
          <div className="auth-panel">
            <div className="auth-title">Accedi</div>
            <button
              className="auth-button"
              type="button"
              onClick={handleGoogle}
              disabled={authBusy}
            >
              <img className="auth-button__icon" src="/google.png" alt="" aria-hidden="true" />
              <span>Accedi con Google</span>
            </button>
            <div className="auth-guest">
              <button
                className="auth-link"
                type="button"
                onClick={handleGuest}
                disabled={authBusy}
              >
                Continua come ospite
              </button>
            </div>
            {authError && <div className="auth-error">{authError}</div>}
          </div>
        </div>
      </div>
    )
  }

  if (!profileLoaded) {
    return (
      <div className="app-shell">
        <div className="auth-screen" role="status" aria-live="polite">
          <div className="auth-panel">
            <div className="auth-title">Caricamento profilo...</div>
          </div>
        </div>
      </div>
    )
  }

  if (needsPlayerName) {
    const handleNameChange = (event) => {
      const nativeEvent = event.nativeEvent || {}
      const inputType = nativeEvent.inputType
      const data = nativeEvent.data
      const targetValue = event.target.value

      setNameDraft((prev) => {
        if (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') {
          return prev.slice(0, -1)
        }

        if (inputType === 'insertFromPaste') {
          return sanitizePlayerName(targetValue)
        }

        if (typeof data === 'string' && data.length > 0) {
          return sanitizePlayerName(prev + data)
        }

        const raw = sanitizePlayerName(targetValue)
        if (raw.length <= prev.length) {
          return raw
        }
        if (raw.startsWith(prev)) {
          return raw
        }
        let remaining = raw
        for (const char of prev) {
          const index = remaining.indexOf(char)
          if (index >= 0) {
            remaining = remaining.slice(0, index) + remaining.slice(index + 1)
          }
        }
        return sanitizePlayerName(prev + remaining)
      })
    }

    const confirmName = () => {
      if (!nameDraft) {
        return
      }
      const finalName = sanitizePlayerName(nameDraft)
      if (!finalName) {
        return
      }
      setPlayerName(finalName)
      storePlayerName(finalName)
    }

    const handleNameKeyDown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        confirmName()
      }
    }

    const focusNameInput = () => {
      nameInputRef.current?.focus()
    }

    const handleNameDisplayKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        focusNameInput()
      }
    }

    return (
      <div className="app-shell">
        <div className="auth-screen name-screen" role="dialog" aria-live="polite">
          <div className="auth-panel name-panel">
            <div className="name-title">Crea il tuo nome utente</div>
            <div
              className="name-display"
              role="button"
              tabIndex={0}
              onClick={focusNameInput}
              onKeyDown={handleNameDisplayKeyDown}
              aria-label="Inserisci il tuo nome utente"
            >
              {nameSlots}
            </div>
            <input
              ref={nameInputRef}
              className="name-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck="false"
              maxLength={MAX_USERNAME_LENGTH}
              value={nameDraft}
              onChange={handleNameChange}
              onKeyDown={handleNameKeyDown}
              aria-label="Nome utente"
            />
            <div className="name-hint">Massimo 5 caratteri</div>
            <div className="name-actions">
              <button className="action" type="button" onClick={confirmName} disabled={!nameDraft}>
                Conferma
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className={`app app--${gameState}`}>
        <header className="header">
          <div className="header__stats-row">
            <div className="header-card header-card--coins" aria-label="Monete del giocatore">
              <div className="coin-hud coin-hud--banner">
                <img className="coin-hud__icon" src="/coin.png" alt="Moneta" />
                <span className="coin-hud__text">Coins: {coins}</span>
              </div>
            </div>
            <div className="header-card header-card--level">
              <span className="header-card__label">Livello</span>
              <span className="header-card__value">{level}</span>
            </div>
            <div className="header-card header-card--profile">
              <span className="header-card__label">Profilo</span>
              <span className="header-card__value">{playerName || '-'}</span>
              <div className="header-card__actions">
                {isAnonymous && (
                  <button
                    className="header-action"
                    type="button"
                    onClick={handleGoogle}
                    disabled={authBusy}
                  >
                    {localGuest ? 'Accedi con Google' : 'Collega Google'}
                  </button>
                )}
                <button
                  className="header-action"
                  type="button"
                  onClick={handleSignOut}
                  disabled={authBusy}
                >
                  {isAnonymous ? 'Esci ospite' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="cabinet">
          <section className="screen">
            <div className="screen__frame">
              <div className="screen__glow" />
              <div className="board" style={{ '--word-length': wordLength }}>
                {guessedWord.map((letter, index) => {
                  const isEmpty = letter === '_'
                  return (
                    <div
                      className={`tile ${isEmpty ? 'tile--empty' : 'tile--filled'}`}
                      key={`${letter}-${index}`}
                    >
                      <span className="tile__char">{letter}</span>
                    </div>
                  )
                })}
              </div>

              <div className="attempts" aria-label="Tentativi rimasti">
                {attemptIndices.map((index) => (
                  <img
                    key={`life-${index}`}
                    className={`life ${index < attemptsLeft ? 'life--on' : 'life--off'}`}
                    src="/life.png"
                    alt=""
                    aria-hidden="true"
                    draggable="false"
                  />
                ))}
              </div>

              <div className={`message message--${gameState}`} aria-live="polite">
                {message}
              </div>
            </div>
          </section>

          <section className="controls">
            <div className="keyboard" aria-label="Tastiera virtuale">
              {KEY_ROWS.map((row) => (
                <div className="keyboard__row" key={row} style={{ '--keys': row.length }}>
                  {row.split('').map((letter) => {
                    const status = letterStatus[letter]
                    return (
                      <button
                        key={letter}
                        type="button"
                        className={`key ${status ? `key--${status}` : ''}`}
                        onClick={() => applyGuess(letter)}
                        disabled={gameState !== 'playing'}
                      >
                        {letter}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="actions">
              <button className="action" type="button" onClick={startNewGame}>
                Nuova partita
              </button>
            </div>
          </section>
        </main>
        <footer className="credit">
          Made with <span role="img" aria-label="heart">❤️</span> by Ch3rry
        </footer>

        {gameState !== 'playing' && (
          <div className="overlay" role="status" aria-live="polite">
            <div className="overlay__panel">
              <div className="overlay__title">
                {gameState === 'won' ? 'Vittoria!' : 'Game over'}
              </div>
              <div className="overlay__text">{message}</div>
              <button className="action" type="button" onClick={startNewGame}>
                Gioca ancora
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
