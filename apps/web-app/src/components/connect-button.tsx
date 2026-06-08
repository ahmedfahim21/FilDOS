import { useWeb3AuthConnect, useWeb3AuthDisconnect } from '@web3auth/modal/react'
import { Button } from './ui/button';
import { useQueryClient } from '@tanstack/react-query';

function ConnectButton() {
  const { connect, loading: connectLoading, isConnected } = useWeb3AuthConnect()
  const { disconnect, loading: disconnectLoading } = useWeb3AuthDisconnect()
  const queryClient = useQueryClient()

  const loading = connectLoading || disconnectLoading

  const handleDisconnect = async () => {
    await disconnect()
    queryClient.clear()
  }

  return (
    <div>
      <Button 
        onClick={() => isConnected ? handleDisconnect() : connect()} 
        disabled={loading}
      >
        {loading ? (isConnected ? 'Disconnecting...' : 'Connecting...') : (isConnected ? 'Disconnect' : 'Connect')}
      </Button>
    </div>
  )
}

export default ConnectButton;