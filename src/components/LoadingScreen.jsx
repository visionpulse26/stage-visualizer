function LoadingScreen() {
  return (
    <div className="absolute inset-0 bg-dark-900 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-dark-600 rounded-full" />
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-accent-purple rounded-full animate-spin" />
        </div>
        <div className="text-white/70 text-sm font-medium">Loading 3D Scene...</div>
      </div>
    </div>
  )
}

export default LoadingScreen
