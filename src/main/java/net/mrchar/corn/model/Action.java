package net.mrchar.corn.model;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "action")
@EntityListeners(AuditingEntityListener.class)
public class Action {
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "space_id")
    private Space space;

    @ElementCollection
    @CollectionTable(name = "action_label")
    private Set<Label> labels;

    @ManyToOne
    @JoinColumn(name = "parent_id")
    private Action parent;

    @Column(name = "name")
    private String name;

    @OneToMany(mappedBy = "parent", fetch = FetchType.LAZY)
    private Set<Action> children;

    @CreatedDate
    @Column(name = "created", columnDefinition = "TIMESTAMP")
    private LocalDateTime created;

    @LastModifiedDate
    @Column(name = "modified", columnDefinition = "TIMESTAMP")
    private LocalDateTime modified;
}
