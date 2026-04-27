'use client'

/**
 * Visibility-guaranteed primitive scene. Renders inside the existing
 * <Canvas> to prove the WebGL render pipeline is reaching the camera.
 *
 * Everything here is intentionally oversized, brightly colored, and uses
 * meshStandardMaterial under bright ambient + directional lights so the
 * geometry is impossible to miss. If a user cannot see this, the issue is
 * in Canvas/camera/render plumbing, not in scenario data.
 */
export function EmergencyScene3D() {
  return (
    <group>
      {/* Bright ambient + a strong directional fill from above. */}
      <ambientLight intensity={1.6} color="#FFFFFF" />
      <directionalLight position={[20, 40, 20]} intensity={1.4} color="#FFFFFF" />
      <directionalLight position={[-20, 30, -10]} intensity={0.8} color="#CFE2FF" />

      {/* Giant 80x80 ft floor — light gray so any object on it has contrast. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#A5ADBA" />
      </mesh>

      {/* Floor grid lines so depth is obvious. */}
      <gridHelper args={[80, 16, '#FF8A3D', '#3B2417']} position={[0, 0.02, 0]} />

      {/* Center marker (debug origin). */}
      <axesHelper args={[8]} />

      {/* Giant 6 ft red cube at center court. */}
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[6, 6, 6]} />
        <meshStandardMaterial color="#E53935" emissive="#3A0A0A" />
      </mesh>

      {/* Giant 4 ft blue sphere floating above the cube. */}
      <mesh position={[0, 12, 0]}>
        <sphereGeometry args={[2, 32, 32]} />
        <meshStandardMaterial color="#1E88E5" emissive="#0A1A3A" />
      </mesh>

      {/* Tall yellow column to anchor scale on the right. */}
      <mesh position={[12, 6, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 12, 24]} />
        <meshStandardMaterial color="#FDD835" emissive="#3A2E00" />
      </mesh>

      {/* Tall green column on the left. */}
      <mesh position={[-12, 6, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 12, 24]} />
        <meshStandardMaterial color="#43A047" emissive="#0A2A12" />
      </mesh>
    </group>
  )
}
