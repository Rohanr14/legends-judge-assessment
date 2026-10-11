import React, { useRef, useState, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player/youtube';
import { Play, Maximize, Minimize } from 'lucide-react';
import { CONTACT_EMAIL } from '../utils/constants';

interface VideoPlayerProps {
  youtubeVideoId: string;
  /** Called once playback actually starts, with the video's length in seconds. */
  onStart?: (durationSeconds: number) => void;
  /** Where to begin, in seconds, read when playback starts (used to resume after a page reload). */
  getStartOffset?: () => number;
  onEnded: () => void;
  onError?: () => void;
  onProgress: (progress: number) => void;
}

// Judges watch each video once, start to finish: there are no YouTube controls,
// pausing resumes playback, and the video can't be replayed after it ends.
const VideoPlayer: React.FC<VideoPlayerProps> = React.memo(({ youtubeVideoId, onStart, getStartOffset, onEnded, onError, onProgress }) => {
  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    hasStarted: false,
    hasEnded: false,
    isFullscreen: false,
  });
  const [hasError, setHasError] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const playerRef = useRef<ReactPlayer>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // iPhones don't support fullscreen for anything but native video elements.
    setCanFullscreen(document.fullscreenEnabled);

    const handleFullscreenChange = () => {
      setPlayerState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement }));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleProgress = useCallback((state: { played: number }) => {
    onProgress(state.played);
  }, [onProgress]);

  const handlePlay = useCallback(() => {
    if (!playerState.hasStarted && !playerState.hasEnded) {
      setPlayerState(prev => ({ ...prev, isPlaying: true, hasStarted: true }));
    } else if (!playerState.hasEnded) {
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [playerState.hasStarted, playerState.hasEnded]);

  const handleStart = useCallback(() => {
    const offset = getStartOffset?.() ?? 0;
    if (offset > 1) {
      playerRef.current?.seekTo(offset, 'seconds');
    }
    onStart?.(playerRef.current?.getDuration() ?? 0);
  }, [getStartOffset, onStart]);

  const handlePause = useCallback(() => {
    if (!playerState.hasEnded) {
      playerRef.current?.getInternalPlayer().playVideo();
    }
  }, [playerState.hasEnded]);

  const handleEnded = useCallback(() => {
    setPlayerState(prev => ({ ...prev, isPlaying: false, hasEnded: true }));
    onEnded();
  }, [onEnded]);

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen();
    }
  }, []);

  return (
    <div ref={containerRef} className="relative group w-full aspect-video">
      <ReactPlayer
        ref={playerRef}
        url={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
        width="100%"
        height="100%"
        playing={playerState.isPlaying && !playerState.hasEnded}
        controls={false}
        onPlay={handlePlay}
        onStart={handleStart}
        onProgress={handleProgress}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleError}
        pip={false}
        config={{
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
          },
        }}
      />
      {hasError ? (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-center p-6 z-20">
          <p className="text-white text-xl mb-2">This video couldn&apos;t be loaded.</p>
          <p className="text-gray-300">
            Please let us know at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-400 underline hover:text-indigo-300">
              {CONTACT_EMAIL}
            </a>
            , then continue with the rest of the assessment.
          </p>
        </div>
      ) : (
        !playerState.isPlaying && !playerState.hasEnded && (
          <button
            onClick={handlePlay}
            aria-label="Play video"
            className="absolute inset-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 group-hover:opacity-100 z-20"
          >
            <Play size={64} className="text-white" />
          </button>
        )
      )}
      {canFullscreen && (
        <div className="absolute bottom-0 right-0 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100 z-20">
          <button
            onClick={handleFullscreenToggle}
            aria-label={playerState.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="bg-white bg-opacity-25 text-white p-2 rounded-full hover:bg-opacity-50 transition-colors duration-300"
          >
            {playerState.isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
          </button>
        </div>
      )}
      {playerState.hasEnded && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <p className="text-white text-2xl">Video Ended</p>
        </div>
      )}
      <div
        className="absolute inset-0 z-10"
        onClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
