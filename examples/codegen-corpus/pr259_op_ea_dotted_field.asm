; ZAX lowered .asm trace
; range: $0100..$0104 (end exclusive)

; func main begin
main:
ld A, (p)                      ; 0100: 3A 00 00
ret                            ; 0103: C9
; func main end

; symbols:
; label main = $0100
; var p = $0104
