; ZAX lowered .asm trace
; range: $0100..$0131 (end exclusive)

; func read_counter begin
read_counter:
ld HL, (counter)               ; 0100: 2A 00 00
ret                            ; 0103: C9
; func read_counter end
; func write_counter begin
write_counter:
ld HL, $0002                   ; 0104: 21 02 00
add HL, SP                     ; 0107: 39
ld a, (hl) ; inc hl ; ld h, (hl) ; ld l, a ; 0108: 7E 23 66 6F
push HL                        ; 010C: E5
ld HL, counter                 ; 010D: 21 00 00
pop DE                         ; 0110: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0111: 73 23 72
ret                            ; 0114: C9
; func main begin
; func write_counter end
main:
push AF                        ; 0115: F5
push BC                        ; 0116: C5
push DE                        ; 0117: D5
push IX                        ; 0118: DD E5
push IY                        ; 011A: FD E5
push HL                        ; 011C: E5
ld HL, $007B                   ; 011D: 21 7B 00
push HL                        ; 0120: E5
call write_counter             ; 0121: CD 00 00
pop BC                         ; 0124: C1
pop HL                         ; 0125: E1
pop IY                         ; 0126: FD E1
pop IX                         ; 0128: DD E1
pop DE                         ; 012A: D1
pop BC                         ; 012B: C1
pop AF                         ; 012C: F1
ld HL, (counter)               ; 012D: 2A 00 00
ret                            ; 0130: C9
; func main end

; symbols:
; label read_counter = $0100
; label write_counter = $0104
; label main = $0115
; var counter = $0132
