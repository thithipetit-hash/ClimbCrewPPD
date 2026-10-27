// Médias personnels importés avec les droits nécessaires, conservés uniquement sur cet appareil.
const DB_NAME = "climbcrew-competences-medias";
const STORE_NAME = "assets";
const DB_VERSION = 1;
export const MEDIA_LIMIT_BYTES = Object.freeze({ video: 200 * 1024 * 1024, image: 12 * 1024 * 1024 });
const ALLOWED_TYPES = Object.freeze({
  video: ["video/mp4", "video/webm"],
  image: ["image/png", "image/jpeg", "image/webp"],
});

function openMediaDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Le stockage local de médias n'est pas pris en charge par ce navigateur."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d'ouvrir le stockage local."));
    request.onblocked = () => reject(new Error("Fermez les autres onglets de ClimbCrew et réessayez."));
  });
}

async function transact(key, mode, callback) {
  const db = await openMediaDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = callback(transaction.objectStore(STORE_NAME), key);
      let result = null;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("Erreur de lecture ou d'écriture du média."));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error("Le stockage du média a échoué."));
      transaction.onerror = () => reject(transaction.error || new Error("Erreur de stockage du média."));
    });
  } finally {
    db.close();
  }
}

export function validateMediaFile(file, type) {
  if (!file || !Object.hasOwn(MEDIA_LIMIT_BYTES, type) || !ALLOWED_TYPES[type].includes(file.type)) {
    throw new Error(type === "video" ? "Choisissez une vidéo MP4 ou WebM." : "Choisissez une image PNG, JPEG ou WebP.");
  }
  if (file.size <= 0 || file.size > MEDIA_LIMIT_BYTES[type]) {
    throw new Error(type === "video" ? "La vidéo doit faire moins de 200 Mo." : "L'image doit faire moins de 12 Mo.");
  }
  return true;
}

export function mediaStorageKey(type, id) {
  if (!Object.hasOwn(MEDIA_LIMIT_BYTES, type) || !/^[a-z0-9-]+$/.test(id)) {
    throw new Error("Identifiant de média invalide.");
  }
  return type + ":" + id;
}

export async function getLocalMedia(type, id) {
  const result = await transact(mediaStorageKey(type, id), "readonly", (store, key) => store.get(key));
  return result instanceof Blob ? result : null;
}

export async function saveLocalMedia(type, id, file) {
  validateMediaFile(file, type);
  await transact(mediaStorageKey(type, id), "readwrite", (store, key) => store.put(file, key));
}

export async function deleteLocalMedia(type, id) {
  await transact(mediaStorageKey(type, id), "readwrite", (store, key) => store.delete(key));
}
