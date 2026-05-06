using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;

/// <summary>
/// UDPReceiver — Listens for UDP datagrams broadcast by the Python inference
/// engine (inference.py) and forwards them to ARTextPlacer on the Unity main thread.
///
/// Uses a CancellationToken for clean shutdown (replaces deprecated Thread.Abort).
/// </summary>
public class UDPReceiver : MonoBehaviour
{
    [Header("Network Settings")]
    [Tooltip("UDP port must match UDP_PORT in inference.py")]
    public int port = 5052;

    [Header("Component References")]
    public ARTextPlacer arTextPlacer;

    // ── Internals ──────────────────────────────────────────────────────────────
    private Thread               receiveThread;
    private UdpClient            client;
    private CancellationTokenSource cts;

    private volatile string      lastReceivedString = "";
    private volatile bool        hasNewData         = false;

    void Start()
    {
        if (arTextPlacer == null)
            Debug.LogWarning("[UDPReceiver] arTextPlacer is not assigned; predictions will be logged only.");

        cts           = new CancellationTokenSource();
        receiveThread = new Thread(() => ReceiveData(cts.Token)) { IsBackground = true };
        receiveThread.Start();
        Debug.Log($"[UDPReceiver] Listening on UDP port {port}");
    }

    private void ReceiveData(CancellationToken token)
    {
        try
        {
            client = new UdpClient(port);
            client.Client.ReceiveTimeout = 500; // ms — allows token check loop

            while (!token.IsCancellationRequested)
            {
                try
                {
                    IPEndPoint anyIP = new IPEndPoint(IPAddress.Any, 0);
                    byte[] data      = client.Receive(ref anyIP);
                    string text      = Encoding.UTF8.GetString(data);

                    lastReceivedString = text;
                    hasNewData         = true;
                    Debug.Log($"[UDPReceiver] Received: {text}");
                }
                catch (SocketException ex) when (ex.SocketErrorCode == SocketError.TimedOut)
                {
                    // Expected timeout — continue loop to check cancellation
                }
                catch (Exception ex)
                {
                    if (!token.IsCancellationRequested)
                        Debug.LogError($"[UDPReceiver] Error: {ex.Message}");
                }
            }
        }
        finally
        {
            client?.Close();
            Debug.Log("[UDPReceiver] Socket closed.");
        }
    }

    void Update()
    {
        // Unity UI must be updated on the main thread
        if (!hasNewData) return;
        hasNewData = false;

        if (arTextPlacer != null)
            arTextPlacer.UpdateTranslation(lastReceivedString);
        else
            Debug.Log($"[UDPReceiver] Translation (no ARTextPlacer): {lastReceivedString}");
    }

    void OnApplicationQuit()
    {
        cts?.Cancel();
        // Thread joins naturally due to IsBackground + timeout loop
    }

    void OnDestroy()
    {
        cts?.Cancel();
    }
}
