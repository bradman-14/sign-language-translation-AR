using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using TMPro;

public class ARTextPlacer : MonoBehaviour
{
    [Header("AR Components")]
    public ARRaycastManager raycastManager;
    public ARCameraManager cameraManager;
    
    [Header("UI Prefab")]
    public GameObject textPrefab;
    private GameObject activeTextInstance;
    private TextMeshPro textComponent;

    // Projected coordinates from MediaPipe (Normalized 0.0 - 1.0)
    // We default to the center slightly offset.
    private Vector2 targetViewportPos = new Vector2(0.5f, 0.4f);

    void Start()
    {
        // Instantiate the text object but hide it initially
        if (textPrefab != null)
        {
            activeTextInstance = Instantiate(textPrefab);
            textComponent = activeTextInstance.GetComponent<TextMeshPro>();
            activeTextInstance.SetActive(false);
        }
    }

    void Update()
    {
        // Continuously try to anchor text near the tracked subject
        UpdateTextPosition();
    }

    public void UpdateTranslation(string translation)
    {
        if (textComponent != null)
        {
            textComponent.text = translation;
            activeTextInstance.SetActive(true);
        }
    }

    private void UpdateTextPosition()
    {
        if (!activeTextInstance.activeSelf) return;

        // Convert normalized viewport coordinates from MediaPipe to Screen Space
        Vector2 screenPosition = new Vector2(
            targetViewportPos.x * Screen.width,
            targetViewportPos.y * Screen.height
        );

        List<ARRaycastHit> hits = new List<ARRaycastHit>();
        
        // Raycast against the real-world point cloud/planes
        if (raycastManager.Raycast(screenPosition, hits, TrackableType.FeaturePoint | TrackableType.PlaneWithinPolygon))
        {
            Pose hitPose = hits[0].pose;
            
            // Anchor text to the 3D depth vector obtained via AR Foundation
            activeTextInstance.transform.position = Vector3.Lerp(activeTextInstance.transform.position, hitPose.position, Time.deltaTime * 5f);
            
            // Ensure the text always faces the user's camera
            Vector3 cameraPosition = Camera.main.transform.position;
            activeTextInstance.transform.LookAt(cameraPosition);
            activeTextInstance.transform.Rotate(0, 180, 0); // Correct text orientation
        }
    }
}
