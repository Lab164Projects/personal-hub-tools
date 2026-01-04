import { LinkItem, UserConfig, DriveFileContent } from "../types";

// Dichiarazione tipi globali per Google Scripts
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DB_FILENAME = 'pentest_hub_db_v4.json';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleDrive = (clientId: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!clientId) {
        resolve(false);
        return;
    }

    const checkScripts = setInterval(() => {
        if (window.gapi && window.google) {
            clearInterval(checkScripts);
            initializeGapiClient(clientId).then(() => {
                resolve(true);
            });
        }
    }, 100);
  });
};

const initializeGapiClient = async (clientId: string) => {
  await new Promise<void>((resolve, reject) => {
    window.gapi.load('client', { callback: resolve, onerror: reject });
  });

  await window.gapi.client.init({
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: '', // defined later
  });
  gisInited = true;
};

// Richiede Access Token all'utente
const requestAccessToken = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject("Google API not initialized");

    tokenClient.callback = (resp: any) => {
      if (resp.error !== undefined) {
        reject(resp);
      }
      resolve();
    };

    // Richiede token. Prompt se non presente o scaduto.
    if (window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
};

// Cerca il file DB sul Drive
const findDbFile = async (): Promise<string | null> => {
  const response = await window.gapi.client.drive.files.list({
    q: `name = '${DB_FILENAME}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  const files = response.result.files;
  if (files && files.length > 0) {
    return files[0].id;
  }
  return null;
};

// Funzione principale di Sync
export const syncWithDrive = async (
  localLinks: LinkItem[], 
  userConfig: UserConfig
): Promise<{ links: LinkItem[], mergedCount: number } | null> => {
  
  if (!gapiInited || !gisInited) {
      throw new Error("Servizi Google non inizializzati. Controlla il Client ID nel profilo.");
  }

  try {
    await requestAccessToken();
    
    const fileId = await findDbFile();
    let remoteData: DriveFileContent | null = null;
    let mergedLinks = [...localLinks];
    let mergedCount = 0;

    // 1. SCARICA (Se il file esiste)
    if (fileId) {
        const result = await window.gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        remoteData = result.result as DriveFileContent;
        
        // Merge Logic: Aggiungi link remoti che non esistono localmente (basato su URL)
        // Nota: Qui potremmo implementare una logica più complessa basata su 'lastUpdated'
        const localUrls = new Set(localLinks.map(l => l.url.toLowerCase()));
        
        if (remoteData && remoteData.links) {
            remoteData.links.forEach(rLink => {
                if (!localUrls.has(rLink.url.toLowerCase())) {
                    mergedLinks.push(rLink);
                    mergedCount++;
                }
            });
        }
    }

    // 2. CARICA (Upload del merge)
    const contentToSave: DriveFileContent = {
        lastUpdated: Date.now(),
        links: mergedLinks,
        userConfig: {
            email: userConfig.email,
            isSetup: userConfig.isSetup,
            // Non salviamo passwordHash o token sensibili nel JSON raw per sicurezza
            // ma salviamo la struttura per il restore
        }
    };

    const fileContent = JSON.stringify(contentToSave, null, 2);
    const fileMetadata = {
        name: DB_FILENAME,
        mimeType: 'application/json',
    };

    if (fileId) {
        // Update existing file
        await window.gapi.client.request({
            path: `/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'multipart' },
            headers: { 'Content-Type': 'application/json' },
            body: fileContent
        });
    } else {
        // Create new file
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + window.gapi.client.getToken().access_token }),
            body: form
        });
    }

    return { links: mergedLinks, mergedCount };

  } catch (err) {
    console.error("Errore Sync Drive:", err);
    throw err;
  }
};