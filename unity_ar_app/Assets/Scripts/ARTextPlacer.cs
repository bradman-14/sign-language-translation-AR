using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using TMPro;

/// <summary>
/// ARTextPlacer — Anchors translated ISL text in 3D world space adjacent
/// to the detected speaker using AR Foundation raycasting + depth sensing.
/// 
/// Setup:
///   1. Attach this script to your AR Session Origin or an empty GameObject.
///   2. Assign the ARRaycastManager from the AR Session Origin in the Inspector.
///   3. Assign a prefab that has a TextMeshPro component to the textPrefab field.
///   4. UDPReceiver calls UpdateTranslation() with prediction strings.
/// </summary>
public class ARTextPlacer : MonoBehaviour
{
    [Header("AR Components")]
    public ARRaycastManager raycastManager;
    public ARCameraManager cameraManager;

    [Header("Text Prefab (must have TextMeshPro component)")]
    public GameObject textPrefab;

    [Header("Placement Settings")]
    [Tooltip("Position in normalized viewport space (0-1) where AR text appears.")]
    public Vector2 targetViewportPos = new Vector2(0.5f, 0.38f);

    [Tooltip("Lerp speed for smooth text repositioning.")]
    public float lerpSpeed = 5f;

    [Tooltip("How many seconds translated text stays visible before fading.")]
    public float displayDuration = 4f;

    // ── Internals ──────────────────────────────────────────────────────────────
    private GameObject       activeTextInstance;
    private TextMeshPro      textComponent;
    private List<ARRaycastHit> hits = new List<ARRaycastHit>();
    private float            lastUpdateTime = -999f;
    private bool             isInitialized  = false;

    void Start()
    {
        if (textPrefab == null)
        {
            Debug.LogWarning("[ARTextPlacer] textPrefab is not assigned. Text will not display.");
            return;
        }

        activeTextInstance = Instantiate(textPrefab);
        textComponent      = activeTextInstance.GetComponent<TextMeshPro>();

        if (textComponent == null)
        {
            Debug.LogError("[ARTextPlacer] textPrefab does not contain a TextMeshPro component.");
            return;
        }

        activeTextInstance.SetActive(false);
        isInitialized = true;
        Debug.Log("[ARTextPlacer] Initialized successfully.");
    }

    void Update()
    {
        if (!isInitialized) return;

        // Auto-hide text after displayDuration seconds
        if (activeTextInstance.activeSelf &&
            Time.time - lastUpdateTime > displayDuration)
        {
            activeTextInstance.SetActive(false);
        }

        if (activeTextInstance.activeSelf)
        {
            UpdateTextPosition();
        }
    }

    /// <summary>
    /// Called by UDPReceiver (on main thread) to display a new translation.
    /// </summary>
    public void UpdateTranslation(string translation)
    {
        if (!isInitialized) return;
        textComponent.text = translation;
        activeTextInstance.SetActive(true);
        lastUpdateTime = Time.time;
    }

    /// <summary>
    /// Translates normalized MediaPipe 2D viewport coordinates to a 3D world
    /// position using AR Foundation raycasting against the real-world point cloud.
    /// </summary>
    private void UpdateTextPosition()
    {
        if (raycastManager == null) return;

        // Convert normalized [0,1] viewport coordinates → screen pixel coordinates
        Vector2 screenPos = new Vector2(
            targetViewportPos.x * Screen.width,
            targetViewportPos.y * Screen.height
        );

        hits.Clear();

        // Raycast against feature points and detected planes
        if (raycastManager.Raycast(screenPos, hits,
            TrackableType.FeaturePoint | TrackableType.PlaneWithinPolygon))
        {
            Pose hitPose = hits[0].pose;

            // Smoothly move text to the depth-resolved 3D world position
            activeTextInstance.transform.position = Vector3.Lerp(
                activeTextInstance.transform.position,
                hitPose.position,
                Time.deltaTime * lerpSpeed
            );

            // Billboard: text always faces the AR camera
            if (Camera.main != null)
            {
                activeTextInstance.transform.LookAt(Camera.main.transform.position);
                activeTextInstance.transform.Rotate(0f, 180f, 0f); // Flip to face camera
            }
        }
    }
}
