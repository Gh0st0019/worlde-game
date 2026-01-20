# Worlde Pixel Italiano

Gioco in stile pixel basato sulla logica di `worlde.py`: indovina la parola italiana lettera per lettera con 10 tentativi.

## Live

Dopo la configurazione DNS: https://worlde.online/

## Avvio

```bash
npm install
npm run dev
```

Il dev server e la preview sono configurati per IPv6-only: apri `http://[::1]:5173/`.
Se vuoi un IPv6 diverso (o un dual stack), modifica `vite.config.js`.

## Struttura

- `src/App.jsx`: logica e UI del gioco
- `src/data/wordBank.js`: parole originali del file Python
- `src/App.css` e `src/index.css`: stile pixel art
