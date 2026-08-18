# Cấp quyền bind port thấp (<1024) cho binary node (chỉ làm 1 lần)
sudo setcap 'cap_net_bind_service=+ep' $(which node)

# Sau đó chạy như user thường
npm run dev        # hoặc npm run build && npm start
