// src/features/player/model/lib/audioController.ts
/**
 * Контроллер для управления HTMLAudioElement.
 * Это единая точка доступа к аудио-элементу во всём приложении.
 * Используется паттерн Singleton: создаётся один экземпляр на всё приложение.
 */
class AudioController {
  private audio: HTMLAudioElement;
  private currentSrc: string = ''; // Отслеживаем установленный источник
  /** Persistent DOM host — audio must stay mounted when Full Player UI unmounts. */
  private mountHost: HTMLElement | null = null;

  constructor() {
    // Создаём один глобальный audio элемент
    this.audio = new Audio();
    // Предзагружаем только метаданные (не весь файл) для экономии трафика
    this.audio.preload = 'metadata';
  }

  /**
   * Keeps the singleton audio element in document.body for the app lifetime.
   * Must not be tied to Full Player mount/unmount or playback stops when closing #player.
   */
  ensureElementInDocument(): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (this.mountHost && !this.mountHost.isConnected) {
      this.mountHost = null;
    }

    if (!this.mountHost) {
      this.mountHost = document.createElement('div');
      this.mountHost.setAttribute('data-player-audio-mount', '');
      this.mountHost.hidden = true;
      document.body.appendChild(this.mountHost);
    }

    if (!this.mountHost.contains(this.audio)) {
      this.mountHost.appendChild(this.audio);
    }
  }

  /**
   * Геттер для получения самого audio элемента.
   * Нужен чтобы прикрепить элемент к DOM и слушать его события.
   */
  get element(): HTMLAudioElement {
    return this.audio;
  }

  /**
   * Устанавливает источник аудио (URL трека) и загружает его.
   * Предотвращает повторную загрузку того же файла.
   * @param src - путь к аудиофайлу
   * @param autoplay - автоматически запускать воспроизведение
   */
  setSource(src: string | undefined, autoplay: boolean = true) {
    const newSrc = src || '';

    // Простая проверка: если источник уже установлен, не перезагружаем
    if (this.currentSrc === newSrc && this.audio.src) {
      if (!autoplay) {
        this.audio.pause();
      }
      return;
    }

    // Устанавливаем новый источник
    this.currentSrc = newSrc;
    this.audio.src = newSrc;
    this.audio.load();

    if (!autoplay) {
      this.audio.pause();
    }
  }

  /**
   * Запускает воспроизведение.
   * Возвращает Promise, который может быть отклонён (например, если браузер блокирует autoplay).
   */
  play() {
    return this.audio.play();
  }

  /**
   * Ставит воспроизведение на паузу.
   */
  pause() {
    this.audio.pause();
  }

  /**
   * Перематывает трек на указанное время (в секундах).
   * @param seconds - время в секундах, на которое нужно перемотать
   */
  setCurrentTime(seconds: number) {
    this.audio.currentTime = seconds;
  }

  /**
   * Устанавливает громкость.
   * @param volume0to100 - громкость от 0 до 100 (переводим в 0-1 для audio.volume)
   */
  setVolume(volume0to100: number) {
    // Ограничиваем значение от 0 до 100 и переводим в диапазон 0-1
    this.audio.volume = Math.max(0, Math.min(100, volume0to100)) / 100;
  }
}

// Экспортируем единственный экземпляр контроллера (Singleton)
export const audioController = new AudioController();
