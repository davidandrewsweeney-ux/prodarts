import http.server, os, sys
os.chdir(os.path.join(os.path.dirname(__file__), 'public'))
http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=3000)
