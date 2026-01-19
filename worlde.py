import random

word_bank = ["abito", "aceto", "acqua", "aglio", "agone", "aiuto", "alibi", "alito", "anima", "ansia", "apice", "apnea", "aroma", "asilo", "attua", "audio", "avena", "avvio", "bacio", "badge", "banca", "barca", "bello", "benda", "besti", "bevvi", "bioma", "bivio", "bluff", "boato", "bocca", "borsa", "brama", "bravo", "breve", "brina", "bromo", "bruci", "cacao", "calma", "caldo", "calza", "canto", "capra", "cardo", "carro", "cassa", "causa", "cedro", "cella", "cenno", "certo", "chili", "ciclo", "cifra", "clima", "colpa", "colpo", "conto", "corda", "corno", "costa", "covid", "crisi", "croce", "culla", "cuore", "curva", "danza", "dardo", "dente", "detto", "dieta", "dirai", "disco", "dolce", "donna", "drone", "duomo", "ebano", "edera", "elica", "email", "entra", "epoca", "erede", "esame", "esito", "etica", "evita", "extra", "fame", "fango", "farro", "fasce", "felpa", "festa", "fiato", "fibra", "fieno", "finta", "firma", "fisco", "fisso", "fitta", "flame", "flora", "folla", "fonte", "forma", "forno", "forte", "forum", "fossa", "foton", "frana", "freno", "froll", "fronte", "fuggi", "fusto", "gamba", "gamma", "gatto", "gelso", "genio", "gesto", "ghisa", "gioco", "giova", "gomma", "grado", "grano", "grata", "greco", "guida", "hotel", "icona", "igloo", "imago", "incro", "india", "input", "invio", "iride", "isola", "karma", "laser", "latte", "leale", "legge", "lente", "libro", "limbo", "linea", "liuto", "lobby", "lunga", "luogo", "luogo", "magma", "mais", "malta", "mamma", "mappa", "marca", "maree", "media", "mente", "merce", "metro", "mezzo", "miele", "mille", "minio", "mitra", "modem", "molle", "mondo", "monte", "morsa", "morto", "mosca", "mucus", "multa", "nastro", "navee", "nebbia", "nervo", "ninja", "ninna", "nobel", "nozze", "nuora", "oblio", "occhi", "odora", "oliva", "ombra", "opera", "orata", "orcio", "ordine", "orgie", "ossea", "ovale", "ovest", "ozono", "palco", "palla", "palma", "panca", "panee", "pausa", "pelle", "penna", "piano", "pietra", "pigro", "pista", "pizza", "pluto", "polso", "porta", "posto", "pozzo", "prato", "presa", "prete", "prima", "prova", "pugno", "quota", "radio", "ramen", "rango", "reale", "regno", "rendo", "respiro", "rete", "ritmo", "ruolo", "sabba", "sacco", "saldo", "salto", "sapore", "scala", "scena", "scopo", "sedia", "segno", "senso", "siero", "sigma", "simia", "sisma", "sogno", "succo", "sudor", "sunto", "svago", "tacca", "tasto", "tavola", "tempo", "tesla", "tetro", "tiara", "tinto", "tomba", "torre", "trama", "treno", "tuffo", "umano", "unica", "unire", "uscio", "utile", "valle", "vanto", "vapor", "veloce", "vento", "verbo", "verde", "verso", "video", "vigna", "villa", "vinci", "viola", "virgo", "vista", "vital", "vuoto", "zaino", "zanna", "zebra", "zolla", "zitto"]

word = random.choice(word_bank)

guessedWord = ["_"] * len(word)

attempts = 6

while attempts > 0:
  print('\nCurrent word: ' + ' '.join(guessedWord))

  guess = input('Guess a letter: ').lower()

  if guess in word:
    for i in range(len(word)):
        if word[i] == guess:
            guessedWord[i] = guess
    print('Great guess!')
  else:
    attempts -= 1
    print('Wrong guess! Attempts left: ' + str(attempts))
  if '_' not in guessedWord:
    print('\nCongratulations!! You guessed the word: ' + word)
    input("\nPremi INVIO per uscire...")
    break

if attempts == 0 and '_' in guessedWord:
  print('\nYou\'ve run out of attempts! The word was: ' + word)
  input("\nPremi INVIO per uscire...")
