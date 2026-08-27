// Grabadora de notas de voz para la WEB.
//
// Por que no se usa la de expo-audio aqui: su stop() engancha el escucha de
// 'dataavailable' JUSTO al detener, y si el navegador ya entrego los datos
// antes de ese instante, el audio se pierde y sube un archivo vacio (se vieron
// notas de 5 bytes, que aparecen en el chat pero no suenan).
//
// Aqui se hace al reves, que es el patron seguro: se engancha el escucha ANTES
// de empezar a grabar y se van guardando TODOS los trozos, asi no hay carrera
// posible. En el telefono se sigue usando expo-audio, que graba a archivo y no
// tiene este problema.

// 32 kbps mono alcanza de sobra para voz y pesa ~4 veces menos que 128 kbps.
export const VOICE_BITS_PER_SECOND = 32000;

// MP4/AAC va PRIMERO aunque opus comprima mejor: iOS no puede reproducir WebM
// de ninguna forma (AVFoundation no lo soporta), asi que una nota grabada en
// Chrome quedaba muda para todos los del iPhone. AAC suena en iOS, Android y
// en todos los navegadores. WebM queda de respaldo para Firefox, que no graba
// MP4; esas notas se oiran en web y Android, pero no en iPhone.
const PREFERRED_MIME_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const t of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // isTypeSupported puede lanzar en navegadores viejos.
    }
  }
  return undefined;
}

export interface RecordedVoice {
  blob: Blob;
  /** Sin los parametros del codec: Storage solo acepta el tipo base. */
  mime: string;
  extension: string;
  durationSeconds: number;
}

export class WebVoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private mimeType: string | undefined;

  get isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /**
   * Pide el microfono y empieza.
   * OJO: esta es la UNICA peticion de microfono en web. Antes se pedia tambien
   * por fuera (para el permiso) y quedaban DOS capturas abiertas; iOS solo
   * permite una activa, asi que la segunda grababa en silencio.
   * Lanza 'denied' si la persona no da permiso.
   */
  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador no permite grabar audio.');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Este navegador no permite grabar audio.');
    }

    try {
      this.stream = await this.askForMic();
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        throw new Error('denied');
      }
      throw e;
    }

    this.mimeType = pickMimeType();
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      audioBitsPerSecond: VOICE_BITS_PER_SECOND,
    });

    // CLAVE: enganchado antes de start(), y se guarda cada trozo que llegue.
    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    // El timeslice es CLAVE en Safari de iPhone: sin el, a veces entrega un
    // blob vacio al detener. Pidiendo un trozo por segundo, siempre hay datos.
    this.recorder.start(1000);
    this.startedAt = Date.now();
  }

  private askForMic(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        // Limpian la voz y de paso reducen el tamano del archivo.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  /** Milisegundos grabados hasta ahora. */
  elapsedMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /**
   * Detiene y devuelve el audio completo. Devuelve null si no se capturo nada.
   */
  async stop(): Promise<RecordedVoice | null> {
    const rec = this.recorder;
    if (!rec) return null;

    const durationSeconds = this.elapsedMs() / 1000;

    // Se espera al evento 'stop', que el navegador dispara DESPUES de entregar
    // el ultimo trozo. Asi se garantiza que estan todos.
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        // Fuerza la entrega del ultimo trozo pendiente antes de cerrar.
        if (rec.state === 'recording') rec.requestData();
        rec.stop();
      } catch {
        resolve();
      }
    });

    this.releaseMic();

    const type = (this.mimeType || rec.mimeType || 'audio/webm').split(';')[0];
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    this.recorder = null;
    this.startedAt = 0;

    if (blob.size === 0) return null;

    return {
      blob,
      mime: type,
      extension: type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm',
      durationSeconds,
    };
  }

  /** Descarta la grabacion y suelta el microfono. */
  cancel(): void {
    try {
      this.recorder?.stop();
    } catch {
      // ya estaba detenido
    }
    this.releaseMic();
    this.chunks = [];
    this.recorder = null;
    this.startedAt = 0;
  }

  // Apaga el microfono; si no, Chrome deja el punto rojo en la pestana.
  private releaseMic(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
