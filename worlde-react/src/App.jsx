import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseReady } from './lib/supabaseClient'
import { WORD_BANK } from './data/wordBank'
import './App.css'

const MAX_ATTEMPTS = 10
const RECENT_WORDS_LIMIT = 30
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

const hasGoogleIdentity = (user) => {
  if (!user) {
    return false
  }
  if (user.app_metadata?.provider === 'google') {
    return true
  }
  return Array.isArray(user.identities)
    ? user.identities.some((identity) => identity.provider === 'google')
    : false
}

const getStoredTheme = () => {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const stored = window.localStorage.getItem('worldeTheme')
  if (stored === 'dark' || stored === 'light') {
    return stored
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

const getMinLengthForLevel = (level) => Math.min(6, 4 + Math.floor((level - 1) / 2))

const pickRandomWord = (level, recentWords = []) => {
  const minLength = getMinLengthForLevel(level)
  const candidates = WORD_BANK.filter((word) => word.length >= minLength)
  const recentSet = new Set(recentWords)
  const filtered = candidates.filter((word) => !recentSet.has(word))
  const pool = filtered.length ? filtered : candidates.length ? candidates : WORD_BANK
  return pool[Math.floor(Math.random() * pool.length)]
}

function App() {
  const [word, setWord] = useState('')
  const [guessedWord, setGuessedWord] = useState([])
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [maxAttempts, setMaxAttempts] = useState(MAX_ATTEMPTS)
  const [coins, setCoins] = useState(getStoredCoins)
  const [recentWords, setRecentWords] = useState(getStoredRecentWords)
  const [googleBonusGranted, setGoogleBonusGranted] = useState(false)
  const [message, setMessage] = useState('Inserisci una lettera per iniziare.')
  const [inputValue, setInputValue] = useState('')
  const [gameState, setGameState] = useState('playing')
  const [showStart, setShowStart] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [letterStatus, setLetterStatus] = useState({})
  const [level, setLevel] = useState(getStoredLevel)
  const [theme, setTheme] = useState(getStoredTheme)
  const levelRef = useRef(level)
  const maxAttemptsRef = useRef(maxAttempts)
  const coinsRef = useRef(coins)
  const themeRef = useRef(theme)
  const recentWordsRef = useRef(recentWords)
  const googleBonusRef = useRef(googleBonusGranted)

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
    googleBonusRef.current = googleBonusGranted
  }, [googleBonusGranted])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    root.dataset.theme = theme
    themeRef.current = theme
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('worldeTheme', theme)
    }
    const themeColor = theme === 'dark' ? '#0b0f12' : '#f6efe4'
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', themeColor)
    }
  }, [theme])

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
    if (!supabaseReady || !supabase) {
      return
    }
    if (!authUser) {
      setProfileLoaded(false)
      setWord('')
      setGuessedWord([])
      setAttemptsLeft(MAX_ATTEMPTS)
      setGoogleBonusGranted(false)
      setMessage('Inserisci una lettera per iniziare.')
      setInputValue('')
      setGameState('playing')
      setLetterStatus({})
      return
    }
    let cancelled = false
    const loadProfile = async () => {
      setAuthError('')
      setProfileLoaded(false)
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

      const googleLinked = hasGoogleIdentity(authUser)

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
          theme: themeRef.current,
          google_bonus_granted: googleLinked,
          last_active_at: new Date().toISOString(),
        }
        const { error: insertError } = await supabase.from('player_profiles').insert(insertPayload)
        if (insertError) {
          setAuthError('Impossibile creare il profilo giocatore.')
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
      const nextTheme = data.theme === 'dark' ? 'dark' : 'light'
      setTheme(nextTheme)
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
      setProfileLoaded(true)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [authUser, supabaseReady])

  const saveProfile = useCallback(async () => {
    if (!supabaseReady || !supabase || !authUser) {
      return
    }
    const payload = {
      user_id: authUser.id,
      level,
      coins,
      max_attempts: maxAttempts,
      recent_words: recentWords,
      theme,
      google_bonus_granted: googleBonusGranted,
      last_active_at: new Date().toISOString(),
    }
    await supabase.from('player_profiles').upsert(payload, { onConflict: 'user_id' })
  }, [authUser, coins, googleBonusGranted, level, maxAttempts, recentWords, theme])

  useEffect(() => {
    if (!authUser || !profileLoaded) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      saveProfile()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [authUser, profileLoaded, coins, level, maxAttempts, recentWords, theme, saveProfile])

  const startNewGame = useCallback(() => {
    const currentRecent = recentWordsRef.current
    const nextWord = pickRandomWord(levelRef.current, currentRecent)
    const nextRecent = [nextWord, ...currentRecent.filter((word) => word !== nextWord)]
    setRecentWords(nextRecent)
    setWord(nextWord)
    setGuessedWord(Array(nextWord.length).fill('_'))
    setAttemptsLeft(maxAttemptsRef.current)
    setMessage('Inserisci una lettera per iniziare.')
    setInputValue('')
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

  useEffect(() => {
    if (!showStart && authUser && profileLoaded && !word) {
      startNewGame()
    }
  }, [showStart, authUser, profileLoaded, startNewGame, word])

  const applyGuess = useCallback(
    (rawLetter) => {
      if (showStart || !authUser || !profileLoaded || gameState !== 'playing') {
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
    [attemptsLeft, authUser, gameState, guessedWord, level, maxAttempts, profileLoaded, showStart, word]
  )

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!inputValue) {
      setMessage('Inserisci una lettera prima di inviare.')
      return
    }
    applyGuess(inputValue)
    setInputValue('')
  }

  const handleInputChange = (event) => {
    const raw = event.target.value.toLowerCase()
    const sanitized = raw.replace(/[^a-z]/g, '')
    setInputValue(sanitized.slice(-1))
  }

  useEffect(() => {
    const handleKeydown = (event) => {
      if (showStart || !authUser || !profileLoaded || gameState !== 'playing') {
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
  }, [applyGuess, authUser, gameState, profileLoaded, showStart])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  const isAnonymous = authUser?.is_anonymous === true

  const handleGuest = async () => {
    if (!supabaseReady || !supabase || authBusy) {
      return
    }
    setAuthError('')
    setAuthBusy(true)
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      setAuthError('Accesso ospite non disponibile.')
    }
    setAuthBusy(false)
  }

  const handleGoogle = async () => {
    if (!supabaseReady || !supabase || authBusy) {
      return
    }
    setAuthError('')
    setAuthBusy(true)
    if (isAnonymous) {
      const { error } = await supabase.auth.linkIdentity({ provider: 'google' })
      if (error) {
        setAuthError('Impossibile collegare Google.')
      }
      setAuthBusy(false)
      return
    }
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

  const wordLength = word.length
  const attemptIndices = Array.from({ length: maxAttempts }, (_, index) => index)

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

  if (!supabaseReady) {
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

  if (!authUser) {
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

  return (
    <div className="app-shell">
      <div className={`app app--${gameState}`}>
        <header className="header">
          <div className="header__left">
            <div className="header__badge">
              <span className="header__title">Worlde</span>
            </div>
            <div className="coin-hud" aria-label="Monete del giocatore">
              <img className="coin-hud__icon" src="/coin.png" alt="Moneta" />
              <span className="coin-hud__text">Coins: {coins}</span>
            </div>
          </div>
          <div className="header__meta">
            <div className="meta">
              <span className="meta__label">Parola</span>
              <span className="meta__value">{wordLength} lettere</span>
            </div>
            <div className="meta">
              <span className="meta__label">Livello</span>
              <span className="meta__value">{level}</span>
            </div>
            <div className="meta">
              <span className="meta__label">Tentativi</span>
              <span className="meta__value">
                {attemptsLeft}/{maxAttempts}
              </span>
            </div>
          </div>
          <div className="header__actions">
            {isAnonymous && (
              <button
                className="theme-toggle theme-toggle--wide"
                type="button"
                onClick={handleGoogle}
                disabled={authBusy}
              >
                <span className="theme-toggle__label">Account</span>
                <span className="theme-toggle__value">Collega Google</span>
              </button>
            )}
            <button className="theme-toggle" type="button" onClick={toggleTheme}>
              <span className="theme-toggle__label">Tema</span>
              <span className="theme-toggle__value">
                {theme === 'dark' ? 'Scuro' : 'Chiaro'}
              </span>
            </button>
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
                  <span
                    key={`life-${index}`}
                    className={`life ${index < attemptsLeft ? 'life--on' : 'life--off'}`}
                  />
                ))}
              </div>

              <div className={`message message--${gameState}`} aria-live="polite">
                {message}
              </div>
            </div>
          </section>

          <section className="controls">
            <form className="guess" onSubmit={handleSubmit}>
              <label className="guess__label" htmlFor="letter-input">
                Inserisci una lettera
              </label>
              <div className="guess__row">
                <input
                  id="letter-input"
                  className="guess__input"
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  maxLength={1}
                  autoComplete="off"
                  spellCheck="false"
                  disabled={gameState !== 'playing'}
                />
                <button
                  className="guess__button"
                  type="submit"
                  disabled={gameState !== 'playing'}
                >
                  Invia
                </button>
              </div>
              <div className="guess__hint">Usa tastiera o click sui tasti.</div>
            </form>

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
