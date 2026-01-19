import { useCallback, useEffect, useRef, useState } from 'react'
import { WORD_BANK } from './data/wordBank'
import './App.css'

const MAX_ATTEMPTS = 10
const ATTEMPT_INDICES = Array.from({ length: MAX_ATTEMPTS }, (_, index) => index)
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

const getStoredLevel = () => {
  if (typeof window === 'undefined') {
    return 1
  }
  const stored = Number(window.localStorage.getItem('worldeLevel'))
  return Number.isFinite(stored) && stored > 0 ? stored : 1
}

const getMinLengthForLevel = (level) => Math.min(6, 4 + Math.floor((level - 1) / 2))

const pickRandomWord = (level) => {
  const minLength = getMinLengthForLevel(level)
  const candidates = WORD_BANK.filter((word) => word.length >= minLength)
  const pool = candidates.length ? candidates : WORD_BANK
  return pool[Math.floor(Math.random() * pool.length)]
}

function App() {
  const [word, setWord] = useState('')
  const [guessedWord, setGuessedWord] = useState([])
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [message, setMessage] = useState('Inserisci una lettera per iniziare.')
  const [inputValue, setInputValue] = useState('')
  const [gameState, setGameState] = useState('playing')
  const [letterStatus, setLetterStatus] = useState({})
  const [level, setLevel] = useState(getStoredLevel)
  const levelRef = useRef(level)

  useEffect(() => {
    levelRef.current = level
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('worldeLevel', String(level))
    }
  }, [level])

  const startNewGame = useCallback(() => {
    const nextWord = pickRandomWord(levelRef.current)
    setWord(nextWord)
    setGuessedWord(Array(nextWord.length).fill('_'))
    setAttemptsLeft(MAX_ATTEMPTS)
    setMessage('Inserisci una lettera per iniziare.')
    setInputValue('')
    setGameState('playing')
    setLetterStatus({})
  }, [])

  useEffect(() => {
    startNewGame()
  }, [startNewGame])

  const applyGuess = useCallback(
    (rawLetter) => {
      if (gameState !== 'playing') {
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
          setGameState('won')
          setLevel(nextLevel)
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
        setLevel(1)
        setMessage(`Hai finito i tentativi! La parola era: ${word}. Livello azzerato.`)
      } else {
        setMessage(`Lettera errata! Tentativi rimasti: ${nextAttempts}`)
      }
    },
    [attemptsLeft, gameState, guessedWord, level, word]
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
      if (gameState !== 'playing') {
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
  }, [applyGuess, gameState])

  const wordLength = word.length

  return (
    <div className="app-shell">
      <div className="device-guard" role="status" aria-live="polite">
        <div className="device-guard__panel">
          <div className="device-guard__title">Solo mobile</div>
          <p className="device-guard__text">
            Questa app è pensata per telefoni e tablet. Aprila da un dispositivo mobile.
          </p>
        </div>
      </div>

      <div className={`app app--${gameState}`}>
      <header className="header">
        <div className="header__badge">
          <span className="header__title">Worlde</span>
          <span className="header__subtitle">Pixel Italiano</span>
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
              {attemptsLeft}/{MAX_ATTEMPTS}
            </span>
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
              {ATTEMPT_INDICES.map((index) => (
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
              <button className="guess__button" type="submit" disabled={gameState !== 'playing'}>
                Invia
              </button>
            </div>
            <div className="guess__hint">Usa tastiera o click sui tasti.</div>
          </form>

          <div className="keyboard" aria-label="Tastiera virtuale">
            {LETTERS.map((letter) => {
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

          <div className="actions">
            <button className="action" type="button" onClick={startNewGame}>
              Nuova partita
            </button>
          </div>
        </section>
      </main>

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
