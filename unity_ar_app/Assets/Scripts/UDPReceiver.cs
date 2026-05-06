using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;

public class UDPReceiver : MonoBehaviour
{
    Thread receiveThread;
    UdpClient client;
    public int port = 5052;
    public ARTextPlacer arTextPlacer;

    private string lastReceivedString = "";
    private bool hasNewData = false;

    void Start()
    {
        InitUDP();
    }

    private void InitUDP()
    {
        receiveThread = new Thread(new ThreadStart(ReceiveData));
        receiveThread.IsBackground = true;
        receiveThread.Start();
        Debug.Log("UDP Receiver started on port: " + port);
    }

    private void ReceiveData()
    {
        client = new UdpClient(port);
        while (true)
        {
            try
            {
                IPEndPoint anyIP = new IPEndPoint(IPAddress.Any, 0);
                byte[] data = client.Receive(ref anyIP);
                string text = Encoding.UTF8.GetString(data);
                
                lastReceivedString = text;
                hasNewData = true;
            }
            catch (Exception err)
            {
                Debug.LogError(err.ToString());
            }
        }
    }

    void Update()
    {
        // Unity UI updates must happen on the main thread
        if (hasNewData)
        {
            if(arTextPlacer != null)
            {
                arTextPlacer.UpdateTranslation(lastReceivedString);
            }
            hasNewData = false;
        }
    }

    void OnApplicationQuit()
    {
        if (receiveThread != null)
            receiveThread.Abort();
        if (client != null)
            client.Close();
    }
}
