; ZAX lowered .asm trace
; range: $0100..$013D (end exclusive)

; func read_counter begin
read_counter:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld HL, (counter)               ; 0103: 2A 00 00
pop DE                         ; 0106: D1
pop BC                         ; 0107: C1
pop AF                         ; 0108: F1
ret                            ; 0109: C9
; func read_counter end
; func write_counter begin
write_counter:
push IX                        ; 010A: DD E5
ld IX, $0000                   ; 010C: DD 21 00 00
add IX, SP                     ; 0110: DD 39
push AF                        ; 0112: F5
push BC                        ; 0113: C5
push DE                        ; 0114: D5
push IX                        ; 0115: DD E5
pop HL                         ; 0117: E1
ld DE, $0004                   ; 0118: 11 04 00
add HL, DE                     ; 011B: 19
ld a, (hl) ; inc hl ; ld h, (hl) ; ld l, a ; 011C: 7E 23 66 6F
push HL                        ; 0120: E5
ld HL, counter                 ; 0121: 21 00 00
pop DE                         ; 0124: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0125: 73 23 72
pop DE                         ; 0128: D1
pop BC                         ; 0129: C1
pop AF                         ; 012A: F1
ld SP, IX                      ; 012B: DD F9
pop IX                         ; 012D: DD E1
ret                            ; 012F: C9
; func main begin
; func write_counter end
main:
ld HL, $007B                   ; 0130: 21 7B 00
push HL                        ; 0133: E5
call write_counter             ; 0134: CD 00 00
inc SP                         ; 0137: 33
inc SP                         ; 0138: 33
ld HL, (counter)               ; 0139: 2A 00 00
ret                            ; 013C: C9
; func main end

; symbols:
; label read_counter = $0100
; label write_counter = $010A
; label main = $0130
; var counter = $013E
